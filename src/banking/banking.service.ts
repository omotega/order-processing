import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';
import PaystackServices from 'src/services/paystack/paystack';
import { generateLetterCode } from 'src/utils/helpers';
import { TransferDto } from './dto/banking.validation';
import { AccountService } from '../ledger/account.service';
import { LedgerService } from '../ledger/ledger.service';
import { TransferRepository } from './transfer.repository';
import { UserRepository } from '../auth/user.repository';
import { BeneficiaryRepository } from '../beneficiary/beneficiary.repository';
import { LimitsService } from '../limits/limits.service';
import { AuditService } from '../audit/audit.service';
import { nanoid } from 'nanoid';
import type { NewPayment, NewTransaction } from '../database/database.types';
import {
  ActorType,
  EntryDirection,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '../utils/database.enums';

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);
  private readonly CACHE_TTL = {
    BANKS: 7 * 24 * 60 * 60,
    ACCOUNT_VERIFICATION: 5 * 60,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly accountService: AccountService,
    private readonly ledgerService: LedgerService,
    private readonly transferRepository: TransferRepository,
    private readonly userRepository: UserRepository,
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly limitsService: LimitsService,
    private readonly auditService: AuditService,
  ) {}

  async banks() {
    const cacheKey = 'banks-list';

    try {
      let banks = await this.redisService.getJson(cacheKey);
      if (!banks) {
        const Paystack = new PaystackServices();
        banks = await Paystack.getBank();
        await this.redisService.setJson(cacheKey, banks, this.CACHE_TTL.BANKS);
      }
      return banks;
    } catch (error) {
      this.logger.error('Error in banks method:', error);
      throw new UnprocessableEntityException('Failed to list banks');
    }
  }

  async verifyAccountNumber() {
    const Paystack = new PaystackServices();
    const result = await Paystack.validateAccountNumber({
      accountNumber: '0011223344',
      bankCode: '001',
    });
    return result;
  }

  async transfer(payload: TransferDto['body'], user: { id: string }) {
    try {
      this.logger.log('Transfer Initiated', { payload, userId: user.id });

      const existingTransaction =
        await this.transferRepository.findByIdempotencyKey(
          payload.idempotencyKey,
        );

      if (existingTransaction) {
        this.logger.warn(
          'Duplicate transaction attempt with same idempotencyKey',
          {
            idempotencyKey: payload.idempotencyKey,
            userId: user.id,
          },
        );
        throw new UnprocessableEntityException(
          'Duplicate transfer request detected',
        );
      }

      const account = await this.accountService.findByUserId(user.id);
      if (!account) {
        throw new BadRequestException('Wallet account not found');
      }

      const amount = BigInt(payload.amount);
      if (BigInt(account.balance) < amount) {
        throw new UnprocessableEntityException('Insufficient balance');
      }

      await this.limitsService.assertWithinLimits(user.id, amount);

      const dbUser = await this.userRepository.findById(user.id);
      if (!dbUser) {
        throw new BadRequestException('User not found');
      }

      let accountNumber = payload.accountNumber;
      let bankCode = payload.bankCode;
      const beneficiaryId: string | null = payload.beneficiaryId ?? null;
      let counterpartyName = `${dbUser.firstName} ${dbUser.lastName}`;
      let bankName: string | null = null;

      if (beneficiaryId) {
        const beneficiary = await this.beneficiaryRepository.findById(
          beneficiaryId,
          user.id,
        );
        if (!beneficiary || !beneficiary.isActive) {
          throw new BadRequestException('Beneficiary not found');
        }
        accountNumber = beneficiary.accountNumber;
        bankCode = beneficiary.bankCode;
        counterpartyName = beneficiary.accountName;
        bankName = beneficiary.bankName;
      }

      const {
        accountNumber: resolvedAccountNumber,
        bankCode: resolvedBankCode,
        idempotencyKey,
        description,
      } = {
        accountNumber,
        bankCode,
        idempotencyKey: payload.idempotencyKey,
        description: payload.description,
      };

      const paystack = new PaystackServices();

      const createTransferRecipient = await paystack.createTransferRecipient({
        type: 'nuban',
        name: counterpartyName,
        account_number: resolvedAccountNumber,
        bank_code: resolvedBankCode,
        currency: 'NGN',
      });

      if (!createTransferRecipient.status) {
        this.logger.error(
          'Error in createTransferRecipient method:',
          createTransferRecipient,
        );
        throw new UnprocessableEntityException(createTransferRecipient.message);
      }

      const generateReference = generateLetterCode(16);
      const initiateTransfer = await paystack.initiateTransfer({
        source: 'balance',
        amount: Number(amount),
        reference: generateReference,
        recipient: createTransferRecipient.data.recipient_code,
        reason: description ?? 'Bank transfer',
      });

      if (!initiateTransfer.status) {
        this.logger.error(
          'Error in initiateTransfer method:',
          initiateTransfer,
        );
        throw new UnprocessableEntityException(initiateTransfer.message);
      }

      const suspenseAccount = await this.accountService.findByCode('2100-000');
      if (!suspenseAccount) {
        throw new BadRequestException(
          'Outbound transfer suspense account missing',
        );
      }

      const ledgerResult = await this.ledgerService.createTransaction({
        reference: generateReference,
        description: description ?? 'Bank transfer',
        metadata: {
          userId: user.id,
          accountNumber: resolvedAccountNumber,
          bankCode: resolvedBankCode,
        },
        entries: [
          {
            accountId: account.id,
            direction: EntryDirection.DEBIT,
            amount,
            description: 'Outbound transfer hold',
          },
          {
            accountId: suspenseAccount.id,
            direction: EntryDirection.CREDIT,
            amount,
            description: 'Outbound transfer suspense',
          },
        ],
      });

      const updatedAccount = await this.accountService.findByUserId(user.id);
      const balanceAfter = updatedAccount
        ? BigInt(updatedAccount.balance)
        : BigInt(account.balance) - amount;

      const { payment, transaction } =
        await this.transferRepository.createPaymentAndTransaction(
          {
            id: nanoid(),
            userId: user.id,
            amount,
            currency: 'NGN',
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            provider: PaymentProvider.PAYSTACK,
            paymentReference: generateReference,
            externalReference: initiateTransfer.data.reference,
            status: PaymentStatus.PENDING,
            description: description ?? 'Bank transfer',
            beneficiaryId,
            feeAmount: null,
            netAmount: amount,
            metadata: {
              recipientCode: createTransferRecipient.data.recipient_code,
              bankCode: resolvedBankCode,
              accountNumber: resolvedAccountNumber,
              recipientName: counterpartyName,
              bankName,
            },
            failureReason: null,
            processedAt: null,
            updatedAt: new Date(),
          } as NewPayment,
          {
            id: nanoid(),
            userId: user.id,
            type: TransactionType.TRANSFER,
            amount,
            currency: 'NGN',
            status: TransactionStatus.PENDING,
            direction: TransactionDirection.OUTBOUND,
            reference: generateReference,
            description: description ?? '',
            idempotencyKey,
            balanceBefore: BigInt(account.balance),
            balanceAfter,
            ledgerTransactionId: ledgerResult.transaction.id,
            counterpartyName,
            counterpartyAccount: resolvedAccountNumber,
            metadata: {
              recipientCode: createTransferRecipient.data.recipient_code,
              bankCode: resolvedBankCode,
              accountNumber: resolvedAccountNumber,
              recipientName: counterpartyName,
            },
          } as NewTransaction,
        );

      await this.limitsService.recordUsage(user.id, amount);

      await this.auditService.log({
        actorType: ActorType.USER,
        actorId: user.id,
        action: 'TRANSFER_INITIATED',
        resourceType: 'transaction',
        resourceId: transaction.id,
        after: {
          reference: generateReference,
          amount: amount.toString(),
          ledgerTransactionId: ledgerResult.transaction.id,
        },
      });

      this.logger.log('Transfer initiated successfully', {
        paymentId: payment.id,
        transactionId: transaction.id,
        reference: generateReference,
        amount: amount.toString(),
        currentBalance: balanceAfter.toString(),
        paystackReference: initiateTransfer.data.reference,
        ledgerTransactionId: ledgerResult.transaction.id,
      });

      return {
        status: HttpStatus.OK,
        reference: generateReference,
        transactionId: transaction.id,
        ledgerTransactionId: ledgerResult.transaction.id,
      };
    } catch (error) {
      this.logger.error('Error in transfer method:', error);
      throw new UnprocessableEntityException(error.message);
    }
  }
}

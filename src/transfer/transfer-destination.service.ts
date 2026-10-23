import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BeneficiaryRepository } from '@database/repository/beneficiary.repository';
import { BENEFICIARY_ERRORS } from '@/common/errors/index';
import { BeneficiaryStatus } from '@/utils/database.enums';
import { decryptData } from '@/utils/helpers';
import type { TransferDto } from '@/transfer/dto/transfer.validation';

export type ResolvedTransferDestination = {
  bankCode: string;
  accountNumber: string;
  bankName?: string;
  beneficiaryId?: string;
};

@Injectable()
export class TransferDestinationService {
  constructor(
    private readonly beneficiaryRepository: BeneficiaryRepository,
  ) {}

  async resolve(
    userId: string,
    payload: Pick<
      TransferDto['body'],
      'beneficiaryId' | 'bankCode' | 'accountNumber' | 'bankName'
    >,
  ): Promise<ResolvedTransferDestination> {
    if (payload.beneficiaryId) {
      const beneficiary = await this.beneficiaryRepository.findById(
        payload.beneficiaryId,
        userId,
      );
      if (
        !beneficiary ||
        beneficiary.status === BeneficiaryStatus.INACTIVE
      ) {
        throw new NotFoundException(BENEFICIARY_ERRORS.NOT_FOUND);
      }
      let accountNumber: string;
      try {
        accountNumber = decryptData(beneficiary.accountNumberEncrypted);
      } catch {
        throw new BadRequestException(BENEFICIARY_ERRORS.NOT_FOUND);
      }
      return {
        bankCode: beneficiary.bankCode,
        accountNumber,
        bankName: beneficiary.bankName ?? payload.bankName,
        beneficiaryId: beneficiary.id,
      };
    }
    if (!payload.bankCode || !payload.accountNumber) {
      throw new BadRequestException(
        'Either beneficiaryId or accountNumber and bankCode are required',
      );
    }
    return {
      bankCode: payload.bankCode,
      accountNumber: payload.accountNumber,
      bankName: payload.bankName,
    };
  }
}

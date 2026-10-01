import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId } from '@/utils/id';
import { BeneficiaryRepository } from '@database/repository/beneficiary.repository';
import { AuditService } from '@/audit/audit.service';
import { CreateBeneficiaryDto } from '@/beneficiary/dto/beneficiary.validation';
import type { Beneficiary, NewBeneficiary } from '@/database/database.types';
import { ActorType, BeneficiaryStatus } from '@/utils/database.enums';
import { BENEFICIARY_ERRORS } from '@/common/errors/index';
import { decryptData, encryptData, hashSensitive } from '@/utils/helpers';

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) {
    return accountNumber;
  }
  return `${'*'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}

function toPublicBeneficiary(row: Beneficiary) {
  let accountNumber: string;
  try {
    accountNumber = decryptData(row.accountNumberEncrypted);
  } catch {
    accountNumber = '****';
  }

  return {
    id: row.id,
    userId: row.userId,
    accountNumber: maskAccountNumber(accountNumber),
    bankCode: row.bankCode,
    bankName: row.bankName,
    accountName: row.accountName,
    nickname: row.nickname,
    status: row.status,
    verifiedAt: row.verifiedAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class BeneficiaryService {
  constructor(
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly auditService: AuditService,
  ) {}

  async list(userId: string) {
    const rows = await this.beneficiaryRepository.findByUserId(userId);
    return rows.map(toPublicBeneficiary);
  }

  async create(userId: string, payload: CreateBeneficiaryDto['body']) {
    const accountNumberHash = hashSensitive(payload.accountNumber);
    const existing = await this.beneficiaryRepository.findByAccountHash(
      userId,
      accountNumberHash,
      payload.bankCode,
    );

    if (
      existing &&
      (existing.status === BeneficiaryStatus.ACTIVE ||
        existing.status === BeneficiaryStatus.VERIFIED)
    ) {
      throw new ConflictException(BENEFICIARY_ERRORS.ALREADY_EXISTS);
    }

    const beneficiary = await this.beneficiaryRepository.create({
      id: newId(),
      userId,
      accountNumberEncrypted: encryptData(payload.accountNumber),
      accountNumberHash,
      bankCode: payload.bankCode,
      bankName: payload.bankName ?? null,
      accountName: payload.accountName,
      nickname: payload.nickname ?? null,
      status: BeneficiaryStatus.VERIFIED,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    } as NewBeneficiary);

    await this.auditService.log({
      actorType: ActorType.USER,
      actorId: userId,
      action: 'BENEFICIARY_CREATED',
      resourceType: 'beneficiary',
      resourceId: beneficiary.id,
      changes: {
        after: {
          accountNumberHash,
          bankCode: beneficiary.bankCode,
          status: beneficiary.status,
        },
      },
    });

    return toPublicBeneficiary(beneficiary);
  }

  async getById(userId: string, id: string) {
    const beneficiary = await this.beneficiaryRepository.findById(id, userId);
    if (!beneficiary || beneficiary.status === BeneficiaryStatus.INACTIVE) {
      throw new NotFoundException(BENEFICIARY_ERRORS.NOT_FOUND);
    }
    return toPublicBeneficiary(beneficiary);
  }

  async remove(userId: string, id: string) {
    const beneficiary = await this.beneficiaryRepository.softDelete(id, userId);

    await this.auditService.log({
      actorType: ActorType.USER,
      actorId: userId,
      action: 'BENEFICIARY_DELETED',
      resourceType: 'beneficiary',
      resourceId: id,
      changes: { after: { status: BeneficiaryStatus.INACTIVE } },
    });

    return toPublicBeneficiary(beneficiary);
  }
}

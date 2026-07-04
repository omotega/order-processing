import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { BeneficiaryRepository } from './beneficiary.repository';
import { AuditService } from '../audit/audit.service';
import { CreateBeneficiaryDto } from './dto/beneficiary.validation';
import type { NewBeneficiary } from '../database/database.types';
import { ActorType } from '../utils/database.enums';

@Injectable()
export class BeneficiaryService {
  constructor(
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly auditService: AuditService,
  ) {}

  list(userId: string) {
    return this.beneficiaryRepository.findByUserId(userId);
  }

  async create(userId: string, payload: CreateBeneficiaryDto['body']) {
    const existing = await this.beneficiaryRepository.findByAccount(
      userId,
      payload.accountNumber,
      payload.bankCode,
    );

    if (existing?.isActive) {
      throw new ConflictException('Beneficiary already exists');
    }

    const beneficiary = await this.beneficiaryRepository.create({
      id: nanoid(),
      userId,
      accountNumber: payload.accountNumber,
      bankCode: payload.bankCode,
      bankName: payload.bankName ?? null,
      accountName: payload.accountName,
      nickname: payload.nickname ?? null,
      isVerified: true,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    } as NewBeneficiary);

    await this.auditService.log({
      actorType: ActorType.USER,
      actorId: userId,
      action: 'BENEFICIARY_CREATED',
      resourceType: 'beneficiary',
      resourceId: beneficiary.id,
      after: {
        accountNumber: beneficiary.accountNumber,
        bankCode: beneficiary.bankCode,
      },
    });

    return beneficiary;
  }

  async getById(userId: string, id: string) {
    const beneficiary = await this.beneficiaryRepository.findById(id, userId);
    if (!beneficiary || !beneficiary.isActive) {
      throw new NotFoundException('Beneficiary not found');
    }
    return beneficiary;
  }

  async remove(userId: string, id: string) {
    const beneficiary = await this.beneficiaryRepository.softDelete(id, userId);

    await this.auditService.log({
      actorType: ActorType.USER,
      actorId: userId,
      action: 'BENEFICIARY_DELETED',
      resourceType: 'beneficiary',
      resourceId: id,
    });

    return beneficiary;
  }
}

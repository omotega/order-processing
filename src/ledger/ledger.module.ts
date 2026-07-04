import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { AccountService } from './account.service';
import { LedgerService } from './ledger.service';
import { AccountRepository } from './account.repository';
import { LedgerRepository } from './ledger.repository';

@Global()
@Module({
  providers: [
    AccountRepository,
    LedgerRepository,
    AccountService,
    LedgerService,
  ],
  exports: [AccountRepository, LedgerRepository, AccountService, LedgerService],
})
export class LedgerModule implements OnModuleInit {
  private readonly logger = new Logger(LedgerModule.name);

  constructor(private readonly accountService: AccountService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Ensuring business accounts exist');
    await this.accountService.ensureBusinessAccounts();
  }
}

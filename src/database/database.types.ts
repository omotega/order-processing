import type { Insertable, Selectable, Updateable } from 'kysely';
import type { DB } from '@/database/database.generated';
import {
  AccountRole,
  AccountStatus,
  AccountSubtype,
  AccountType,
  ActorType,
  BeneficiaryStatus,
  EntryDirection,
  IdempotencyKeyState,
  IdempotencyOperation,
  IdempotencyScopeType,
  InboxStatus,
  KycStatus,
  LedgerSourceType,
  LedgerTransactionStatus,
  LimitType,
  PaymentProcessingStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ReconciliationStatus,
  SettlementBatchStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  UserRole,
  UserStatus,
  WebhookEventStatus,
  WebhookProvider,
} from '@/utils/database.enums';

export type Database = DB;

export type OutboxMessage = Selectable<DB['outbox_messages']>;
export type NewOutboxMessage = Insertable<DB['outbox_messages']>;

export type InboxMessage = Selectable<DB['inbox_messages']>;
export type NewInboxMessage = Insertable<DB['inbox_messages']>;

export {
  AccountRole,
  AccountStatus,
  AccountSubtype,
  AccountType,
  ActorType,
  BeneficiaryStatus,
  EntryDirection,
  IdempotencyKeyState,
  IdempotencyOperation,
  IdempotencyScopeType,
  InboxStatus,
  KycStatus,
  LedgerSourceType,
  LedgerTransactionStatus,
  LimitType,
  PaymentProcessingStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ReconciliationStatus,
  SettlementBatchStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  UserRole,
  UserStatus,
  WebhookEventStatus,
  WebhookProvider,
};

export type Accountrole = AccountRole;
export type Accountstatus = AccountStatus;
export type Accountsubtype = AccountSubtype;
export type Accounttype = AccountType;
export type Actortype = ActorType;
export type Beneficiarystatus = BeneficiaryStatus;
export type Entrydirection = EntryDirection;
export type Idempotencykeystate = IdempotencyKeyState;
export type Idempotencyoperation = IdempotencyOperation;
export type Idempotencyscopetype = IdempotencyScopeType;
export type Inboxstatus = InboxStatus;
export type Kycstatus = KycStatus;
export type Ledgersourcetype = LedgerSourceType;
export type Ledgertransactionstatus = LedgerTransactionStatus;
export type Limittype = LimitType;
export type Paymentmethod = PaymentMethod;
export type Paymentprovider = PaymentProvider;
export type Paymentprocessingstatus = PaymentProcessingStatus;
export type Paymentstatus = PaymentStatus;
export type Reconciliationstatus = ReconciliationStatus;
export type Settlementbatchstatus = SettlementBatchStatus;
export type Transactiondirection = TransactionDirection;
export type Transactionstatus = TransactionStatus;
export type Transactiontype = TransactionType;
export type Userrole = UserRole;
export type Userstatus = UserStatus;
export type Webhookeventstatus = WebhookEventStatus;
export type Webhookprovider = WebhookProvider;

export type {
  DB,
  AuditLogs,
  Beneficiaries,
  Generated,
  IdempotencyKeys,
  InboxMessages,
  JsonValue,
  KycProfiles,
  KycVerificationAttempts,
  LedgerAccounts,
  LedgerEntries,
  LedgerTransactions,
  LimitPolicies,
  OutboxMessages,
  Payments,
  ProcessedWebhooks,
  ReconciliationItems,
  SettlementBatches,
  Timestamp,
  Transactions,
  UserAccounts,
  Users,
  WebhookEvents,
} from '@/database/database.generated';

export type User = Selectable<DB['users']>;
export type NewUser = Insertable<DB['users']>;
export type UserUpdate = Updateable<DB['users']>;

export type Account = Selectable<DB['ledger_accounts']>;
export type NewAccount = Insertable<DB['ledger_accounts']>;
export type AccountUpdate = Updateable<DB['ledger_accounts']>;

export type UserAccount = Selectable<DB['user_accounts']>;
export type NewUserAccount = Insertable<DB['user_accounts']>;
export type UserAccountUpdate = Updateable<DB['user_accounts']>;

export type LedgerTransaction = Selectable<DB['ledger_transactions']>;
export type NewLedgerTransaction = Insertable<DB['ledger_transactions']>;

export type LedgerEntry = Selectable<DB['ledger_entries']>;
export type NewLedgerEntry = Insertable<DB['ledger_entries']>;

export type Payment = Selectable<DB['payments']>;
export type NewPayment = Insertable<DB['payments']>;

export type Transaction = Selectable<DB['transactions']>;
export type NewTransaction = Insertable<DB['transactions']>;

export type Beneficiary = Selectable<DB['beneficiaries']>;
export type NewBeneficiary = Insertable<DB['beneficiaries']>;

export type WebhookEvent = Selectable<DB['webhook_events']>;
export type NewWebhookEvent = Insertable<DB['webhook_events']>;

export type ProcessedWebhook = Selectable<DB['processed_webhooks']>;
export type NewProcessedWebhook = Insertable<DB['processed_webhooks']>;

export type AuditLog = Selectable<DB['audit_logs']>;
export type NewAuditLog = Insertable<DB['audit_logs']>;

export type KycProfile = Selectable<DB['kyc_profiles']>;
export type NewKycProfile = Insertable<DB['kyc_profiles']>;

export type KycVerificationAttempt = Selectable<
  DB['kyc_verification_attempts']
>;
export type NewKycVerificationAttempt = Insertable<
  DB['kyc_verification_attempts']
>;

export type LimitPolicy = Selectable<DB['limit_policies']>;
export type NewLimitPolicy = Insertable<DB['limit_policies']>;

export type LimitUsage = Selectable<DB['limit_usage']>;
export type NewLimitUsage = Insertable<DB['limit_usage']>;

export type SettlementBatch = Selectable<DB['settlement_batches']>;
export type NewSettlementBatch = Insertable<DB['settlement_batches']>;

export type ReconciliationItem = Selectable<DB['reconciliation_items']>;
export type NewReconciliationItem = Insertable<DB['reconciliation_items']>;

export type IdempotencyKey = Selectable<DB['idempotency_keys']>;
export type NewIdempotencyKey = Insertable<DB['idempotency_keys']>;
export type IdempotencyKeyUpdate = Updateable<DB['idempotency_keys']>;

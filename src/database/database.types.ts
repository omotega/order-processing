import type { Insertable, Selectable, Updateable } from 'kysely';
import type { DB } from './database.generated';
import {
  AccountSubtype,
  AccountType,
  ActorType,
  EntryDirection,
  KycStatus,
  LedgerTransactionStatus,
  LimitType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ReconciliationStatus,
  SettlementBatchStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  UserRole,
  WebhookEventStatus,
  WebhookProvider,
} from '../utils/database.enums';

export type Database = DB;

export {
  AccountSubtype,
  AccountType,
  ActorType,
  EntryDirection,
  KycStatus,
  LedgerTransactionStatus,
  LimitType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ReconciliationStatus,
  SettlementBatchStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  UserRole,
  WebhookEventStatus,
  WebhookProvider,
};

export type Accountsubtype = AccountSubtype;
export type Accounttype = AccountType;
export type Actortype = ActorType;
export type Entrydirection = EntryDirection;
export type Kycstatus = KycStatus;
export type Ledgertransactionstatus = LedgerTransactionStatus;
export type Limittype = LimitType;
export type Paymentmethod = PaymentMethod;
export type Paymentprovider = PaymentProvider;
export type Paymentstatus = PaymentStatus;
export type Reconciliationstatus = ReconciliationStatus;
export type Settlementbatchstatus = SettlementBatchStatus;
export type Transactiondirection = TransactionDirection;
export type Transactionstatus = TransactionStatus;
export type Transactiontype = TransactionType;
export type Userrole = UserRole;
export type Webhookeventstatus = WebhookEventStatus;
export type Webhookprovider = WebhookProvider;

export type {
  DB,
  Accounts,
  AuditLogs,
  Beneficiaries,
  JsonValue,
  KycProfiles,
  LedgerEntries,
  LedgerTransactions,
  Payments,
  ReconciliationItems,
  SettlementBatches,
  TransactionLimits,
  Transactions,
  Users,
  WebhookEvents,
} from './database.generated';

export type User = Selectable<DB['users']>;
export type NewUser = Insertable<DB['users']>;
export type UserUpdate = Updateable<DB['users']>;

export type Account = Selectable<DB['accounts']>;
export type NewAccount = Insertable<DB['accounts']>;
export type AccountUpdate = Updateable<DB['accounts']>;

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

export type AuditLog = Selectable<DB['audit_logs']>;
export type NewAuditLog = Insertable<DB['audit_logs']>;

export type KycProfile = Selectable<DB['kyc_profiles']>;
export type NewKycProfile = Insertable<DB['kyc_profiles']>;

export type TransactionLimit = Selectable<DB['transaction_limits']>;
export type NewTransactionLimit = Insertable<DB['transaction_limits']>;

export type SettlementBatch = Selectable<DB['settlement_batches']>;
export type NewSettlementBatch = Insertable<DB['settlement_batches']>;

export type ReconciliationItem = Selectable<DB['reconciliation_items']>;
export type NewReconciliationItem = Insertable<DB['reconciliation_items']>;

import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(__dirname, '../src/database/database.generated.ts');

const enumImportBlock = `import type { ColumnType } from "kysely";
import type {
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
  PaymentMethod,
  PaymentProcessingStatus,
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
`;

const replacements: Array<[RegExp, string]> = [
  [
    /export type Accountrole = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Accountrole = AccountRole;',
  ],
  [
    /export type Accountstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Accountstatus = AccountStatus;',
  ],
  [
    /export type Accountsubtype = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Accountsubtype = AccountSubtype;',
  ],
  [
    /export type Accounttype = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Accounttype = AccountType;',
  ],
  [
    /export type Actortype = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Actortype = ActorType;',
  ],
  [
    /export type Beneficiarystatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Beneficiarystatus = BeneficiaryStatus;',
  ],
  [
    /export type Entrydirection = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Entrydirection = EntryDirection;',
  ],
  [
    /export type Idempotencykeystate = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Idempotencykeystate = IdempotencyKeyState;',
  ],
  [
    /export type Idempotencyoperation = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Idempotencyoperation = IdempotencyOperation;',
  ],
  [
    /export type Idempotencyscopetype = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Idempotencyscopetype = IdempotencyScopeType;',
  ],
  [
    /export type Inboxstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Inboxstatus = InboxStatus;',
  ],
  [
    /export type Kycstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Kycstatus = KycStatus;',
  ],
  [
    /export type Ledgersourcetype = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Ledgersourcetype = LedgerSourceType;',
  ],
  [
    /export type Ledgertransactionstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Ledgertransactionstatus = LedgerTransactionStatus;',
  ],
  [
    /export type Limittype = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Limittype = LimitType;',
  ],
  [
    /export type Paymentmethod = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Paymentmethod = PaymentMethod;',
  ],
  [
    /export type Paymentprocessingstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Paymentprocessingstatus = PaymentProcessingStatus;',
  ],
  [
    /export type Paymentprovider = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Paymentprovider = PaymentProvider;',
  ],
  [
    /export type Paymentstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Paymentstatus = PaymentStatus;',
  ],
  [
    /export type Reconciliationstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Reconciliationstatus = ReconciliationStatus;',
  ],
  [
    /export type Settlementbatchstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Settlementbatchstatus = SettlementBatchStatus;',
  ],
  [
    /export type Transactiondirection = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Transactiondirection = TransactionDirection;',
  ],
  [
    /export type Transactionstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Transactionstatus = TransactionStatus;',
  ],
  [
    /export type Transactiontype = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Transactiontype = TransactionType;',
  ],
  [
    /export type Userrole = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Userrole = UserRole;',
  ],
  [
    /export type Userstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Userstatus = UserStatus;',
  ],
  [
    /export type Webhookeventstatus = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Webhookeventstatus = WebhookEventStatus;',
  ],
  [
    /export type Webhookprovider = "[^"]+"(?: \| "[^"]+")*;/,
    'export type Webhookprovider = WebhookProvider;',
  ],
];

let content = fs.readFileSync(filePath, 'utf8');

if (content.includes("from '@/utils/database.enums'")) {
  console.log('database.generated.ts already uses utils enums');
  process.exit(0);
}

if (!content.includes('import type { ColumnType } from "kysely";')) {
  console.error(
    'Could not find kysely ColumnType import in database.generated.ts',
  );
  process.exit(1);
}

content = content.replace(
  /import type \{ ColumnType \} from "kysely";\n/,
  enumImportBlock,
);

for (const [pattern, replacement] of replacements) {
  if (!pattern.test(content)) {
    console.error(`Could not find enum union matching: ${pattern}`);
    process.exit(1);
  }
  content = content.replace(pattern, replacement);
}

fs.writeFileSync(filePath, content);
console.log('Patched database.generated.ts to use utils enums');

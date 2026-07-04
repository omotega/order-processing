import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(__dirname, '../src/database/database.generated.ts');

const enumImportBlock = `import type {
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

export type Accountsubtype = AccountSubtype;
export type Accounttype = AccountType;
export type Actortype = ActorType;
export type Entrydirection = EntryDirection;
export type Kycstatus = KycStatus;
`;

const enumTypeAliases = `export type Ledgertransactionstatus = LedgerTransactionStatus;
export type Limittype = LimitType;
export type Paymentmethod = PaymentMethod;
export type Paymentprovider = PaymentProvider;
export type Paymentstatus = PaymentStatus;
export type Reconciliationstatus = ReconciliationStatus;
export type Settlementbatchstatus = SettlementBatchStatus;
`;

const transactionTypeAliases = `export type Transactiondirection = TransactionDirection;
export type Transactionstatus = TransactionStatus;
export type Transactiontype = TransactionType;
export type Userrole = UserRole;
export type Webhookeventstatus = WebhookEventStatus;
export type Webhookprovider = WebhookProvider;
`;

const generatedUnionPattern =
  /export type Accountsubtype =[\s\S]*?export type Entrydirection = 'CREDIT' \| 'DEBIT';\n/;

const ledgerUnionPattern =
  /export type Ledgertransactionstatus = 'COMPLETED' \| 'REVERSED';\n\nexport type Paymentmethod =[\s\S]*?export type Paymentstatus =[\s\S]*?\| 'REFUNDED';\n\n/;

const transactionUnionPattern =
  /export type Transactiondirection = 'INBOUND' \| 'OUTBOUND';\n\nexport type Transactionstatus =[\s\S]*?export type Transactiontype =[\s\S]*?\| 'WITHDRAWAL';\n\nexport type Userrole = 'ADMIN' \| 'SUPER_ADMIN' \| 'USER';\n\n/;

let content = fs.readFileSync(filePath, 'utf8');

if (content.includes("from '../utils/database.enums'")) {
  console.log('database.generated.ts already uses utils enums');
  process.exit(0);
}

if (!generatedUnionPattern.test(content)) {
  console.error(
    'Could not find account/entry enum block in database.generated.ts',
  );
  process.exit(1);
}

content = content.replace(generatedUnionPattern, enumImportBlock);

if (!ledgerUnionPattern.test(content)) {
  console.error(
    'Could not find ledger/payment enum block in database.generated.ts',
  );
  process.exit(1);
}

content = content.replace(ledgerUnionPattern, enumTypeAliases + '\n');

if (!transactionUnionPattern.test(content)) {
  console.error(
    'Could not find transaction/user enum block in database.generated.ts',
  );
  process.exit(1);
}

content = content.replace(
  transactionUnionPattern,
  transactionTypeAliases + '\n',
);

fs.writeFileSync(filePath, content);
console.log('Patched database.generated.ts to use utils enums');

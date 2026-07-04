# order-processing

NestJS 10 + TypeScript backend. Single-package repo (no monorepo).

## Quick start

```bash
yarn install
# Requires: PostgreSQL, Redis, RabbitMQ running locally
yarn prismaMigrate   # prisma migrate dev
yarn start:dev       # nest start --watch on port 3200
```

## Commands

| Action | Command |
|---|---|
| Build | `yarn build` |
| Dev server (watch) | `yarn start:dev` |
| Lint | `yarn lint` |
| Unit tests | `yarn test` |
| Single test | `npx jest --testPathPattern="auth.service"` |
| E2E tests | `yarn test:e2e` |
| Format | `yarn format` |
| Prisma migrate | `yarn prismaMigrate` |
| Prisma generate | `yarn prismaGenerate` |

No dedicated typecheck script. `strictNullChecks` and `noImplicitAny` are **off** in tsconfig.

## Architecture

- **Entrypoint**: `src/main.ts` — port **3200**, global prefix `/api/v1`, raw body enabled (`{ rawBody: true }`). Includes `BigInt.prototype.toJSON` polyfill for JSON serialization.
- **Money stored as BigInt (kobo)** — all `Decimal(15,2)` fields replaced with `BigInt`. API amounts are in the smallest currency unit (kobo for NGN). Do NOT convert with `* 100` or `toFixed(2)`.
- **Ledger module**: `src/ledger/` — double-entry accounting. `LedgerService.createTransaction()` validates debits = credits, uses optimistic locking on `Account.version`, and creates an immutable audit trail via `LedgerEntry` rows.
- **Account** model replaces `Wallet` as the balance source of truth. Each user has an `Account` with `subtype: USER_WALLET`. Business accounts are auto-created on startup: Settlement Suspense (`1300-000`), Settlement Float (`1301-000`), Fee Revenue (`4100-000`).
- **`Wallet` model** is deprecated but still in the schema. Run `src/scripts/migrate-wallets-to-accounts.ts` to migrate existing data, then drop the model.
- **Modules** under `src/`: `ledger/`, `auth/`, `banking/`, `webhook/`, `rabbitmq/`, `redis/`, `prisma/`
- **PrismaModule**, **RedisModule**, and **LedgerModule** are `@Global()` — providers available without importing
- **JwtAuthGuard** is global (`APP_GUARD`) — use `@Public()` decorator to bypass auth
- **Roles**: `@Roles('ADMIN')` decorator (USER, ADMIN, SUPER_ADMIN)
- **Validation**: custom `ZodValidationPipe` with `{ body, query, params }` schemas using `.strict()`. `nestjs-zod` is a dependency but **not used**.

## Key quirks

- **Prisma client output**: `../generated/prisma` (not default path). Import from `generated/prisma` — this dir is gitignored, generate after clone.
- **`nanoid` pinned to v3** — do not upgrade (breaking changes in v4+).
- **Password hashing**: `argon2` (not bcrypt, despite `bcryptjs` being a dependency).
- **2FA not implemented** (`speakeasy` dep is unused placeholder).
- **Seed script** declared in `package.json` (`ts-node src/seed/seed.ts`) but **file does not exist**.
- **Dockerfile** has a syntax error (unclosed parenthesis in `CMD` line).
- **RateLimitGuard** is commented out on the transfer endpoint.
- **All spec files are stubs** — no real test coverage exists.
- **No CI/CD workflows** set up yet.

## Testing

- Tests co-located as `*.spec.ts` next to source files.
- Jest config inline in `package.json` (`rootDir: "src"`, pattern `*.spec.ts`).
- E2E tests in `test/` with config `test/jest-e2e.json`, pattern `*.e2e-spec.ts`.
- Run order: `lint` → `test`.

## Infrastructure

| Service | Connection | Notes |
|---|---|---|
| PostgreSQL | `DATABASE_URL` env | 4 migrations exist |
| Redis | `REDIS_URL` env | Caching, rate limiting, idempotency |
| RabbitMQ | `RABBITMQ_URL` env (default `amqp://localhost:5672`) | Async webhook processing, DLQ, retry (3 attempts) |
| Paystack | `PAYSTACK_SECRET_KEY` + `PAYSTACK_BASE_URL` env | Payment gateway |

All required env vars are listed in `src/config/config.ts`.

## Existing docs

- `ARCHITECTURE.md` — full system design (851 lines)
- `RABBITMQ_SETUP.md` — local RabbitMQ setup
- `WEBHOOK_ARCHITECTURE.md` — Paystack webhook design

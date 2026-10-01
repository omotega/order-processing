# Local Docker stack

> **CDC inactive:** Debezium Connect and logical replication are commented out in
> [`docker-compose.yml`](../../docker-compose.yml). The application publishes to
> Kafka directly after Postgres commits. Files under this directory are retained
> for reference only.

The root [`docker-compose.yml`](../../docker-compose.yml) runs the local stack:

- PostgreSQL 16
- Redis
- Kafka in KRaft mode (no ZooKeeper)
- Kysely migrations as a one-shot service
- the Nest application on port 3200

RabbitMQ is intentionally disabled with `RABBITMQ_ENABLED=false`.

## Start

Keep application/API secrets in the root `.env`. Compose overrides database,
Redis, Kafka, and RabbitMQ settings with container service addresses.

Optional local database defaults:

```bash
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=order_processing
```

Start and build:

```bash
yarn docker:up
```

The startup order is:

1. PostgreSQL, Redis, and Kafka become healthy.
2. `migrate` applies Kysely migrations.
3. Nest starts and serves `http://localhost:3200/api/v1`.

## Verify

```bash
curl -fsS http://localhost:3200/api/v1/health
docker compose ps
```

## Stop

```bash
yarn docker:down
```

Add `--volumes` manually only when you intentionally want to erase local
PostgreSQL, Redis, Kafka, and Connect state.

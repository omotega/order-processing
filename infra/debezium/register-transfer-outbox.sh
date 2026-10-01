#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

export DEBEZIUM_PG_HOST="${DEBEZIUM_PG_HOST:-postgres}"
export DEBEZIUM_PG_PORT="${DEBEZIUM_PG_PORT:-5432}"
export DEBEZIUM_PG_USER="${DEBEZIUM_PG_USER:-postgres}"
export DEBEZIUM_PG_PASSWORD="${DEBEZIUM_PG_PASSWORD:-pulisic22}"
export DEBEZIUM_PG_DB="${DEBEZIUM_PG_DB:-Backish}"

CONNECT_URL="${CONNECT_URL:-http://connect:8083}"
PAYLOAD="$(envsubst '${DEBEZIUM_PG_HOST} ${DEBEZIUM_PG_PORT} ${DEBEZIUM_PG_USER} ${DEBEZIUM_PG_PASSWORD} ${DEBEZIUM_PG_DB}' < infra/debezium/transfer-outbox-connector.json)"

curl -sf "${CONNECT_URL}/connectors/order-processing-transfer-outbox" >/dev/null 2>&1 && {
  CONFIG="$(printf '%s' "${PAYLOAD}" | jq -c '.config')"
  curl -sf -X PUT \
    "${CONNECT_URL}/connectors/order-processing-transfer-outbox/config" \
    -H 'Content-Type: application/json' \
    --data "${CONFIG}"
  echo
  echo "Updated order-processing-transfer-outbox"
  curl -s "${CONNECT_URL}/connectors/order-processing-transfer-outbox/status"
  echo
  exit 0
}

curl -sf -X POST "${CONNECT_URL}/connectors" \
  -H 'Content-Type: application/json' \
  --data "${PAYLOAD}"

echo
echo "Registered order-processing-transfer-outbox"
curl -s "${CONNECT_URL}/connectors/order-processing-transfer-outbox/status"
echo

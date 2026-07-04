-- Append-only enforcement for the transactions table.
--
-- Prevents any UPDATE or DELETE on the transactions table.
-- Only INSERT is permitted.
--
-- To temporarily disable (e.g. for ad-hoc maintenance):
--   ALTER TABLE transactions DISABLE TRIGGER trg_transactions_append_only;
--
-- To re-enable:
--   ALTER TABLE transactions ENABLE TRIGGER trg_transactions_append_only;

CREATE OR REPLACE FUNCTION reject_transactions_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'transactions table is append-only; UPDATE and DELETE are not permitted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_append_only ON transactions;
CREATE TRIGGER trg_transactions_append_only
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION reject_transactions_modification();

import {
  amountsMatch,
  currenciesMatch,
  TRANSFER_RECONCILIATION_REASON,
} from '@/transfer/provider-events/transfer-money.guards';

describe('transfer-money.guards', () => {
  it('matches amounts across bigint/string/number', () => {
    expect(amountsMatch(1000n, '1000')).toBe(true);
    expect(amountsMatch(1000, 1000n)).toBe(true);
    expect(amountsMatch('1000', 999)).toBe(false);
  });

  it('matches currencies case-insensitively', () => {
    expect(currenciesMatch('NGN', 'ngn')).toBe(true);
    expect(currenciesMatch('NGN', 'USD')).toBe(false);
  });

  it('exposes named reconciliation reasons', () => {
    expect(TRANSFER_RECONCILIATION_REASON.AMOUNT_MISMATCH).toBe(
      'REQUIRES_RECONCILIATION_AMOUNT_MISMATCH',
    );
    expect(TRANSFER_RECONCILIATION_REASON.CURRENCY_MISMATCH).toBe(
      'REQUIRES_RECONCILIATION_CURRENCY_MISMATCH',
    );
  });
});

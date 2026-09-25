import {describe, expect, it} from 'vitest';
import {countsAsMovement} from '../src/intelligence/visuals/spending-patterns';
import {hash, normalizeRow} from '../src/ingest/normalize';
import {reconcile} from '../src/ingest/reconcile';
import type {Document, ImportContext} from '../src/ingest/types';

const transfer = {transfer: true, kind: 'transfer'};
const purchase = {transfer: false, kind: 'discretionary'};

describe('whether a transfer belongs in a picture of spending', () => {
  it('is not spending when every account is pooled', () => {
    // The owner moving $1 between his own banks did not spend a dollar, and the two legs cancel anyway.
    expect(countsAsMovement(transfer, 'all')).toBe(false);
    expect(countsAsMovement(purchase, 'all')).toBe(true);
  });

  it('is a real movement when one account is being looked at', () => {
    // "I transferred from account 1 to account 2, so it should be negative on 1 and positive on 2."
    // One leg, read from two sides: the same rule admits it for either account.
    expect(countsAsMovement(transfer, 'account-1')).toBe(true);
    expect(countsAsMovement(transfer, 'account-2')).toBe(true);
    expect(countsAsMovement(purchase, 'account-1')).toBe(true);
  });
});

describe('pairing the two legs of a transfer between the owner\'s own accounts', () => {
  const context = (accountId: string): ImportContext => ({accountId, accountKind: 'checking', currency: 'AUD', period: {start: '2026-09-01', end: '2026-09-30'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false});
  const doc = (accountId: string, rows: [string, string, string][]): Document => {
    const c = context(accountId), fileHash = hash(accountId);
    return {id: hash(JSON.stringify([accountId, fileHash])), hash: fileHash, fileName: accountId, parser: 'synthetic-test-v1', context: c, opening: '0', closing: '0', payslip: null,
      rows: rows.map(([date, description, amount], i) => normalizeRow({sourceId: String(i), date, description, amount, confidence: 10000}, c))};
  };
  it('pairs repeated equal transfers one to one by nearest date, but never a purchase', () => {
    // "Transfer To Marc" twice on 13 Sep in CommBank, "DEPOSIT-OSKO PAYMENT" twice in Westpac: neither has a unique partner.
    const out = doc('cba', [['13/09/2026', 'Transfer To Marc PayID Phone from CommBank App g', '-1000.00'], ['14/09/2026', 'Transfer To Marc PayID Phone from CommBank App h', '-1000.00']]);
    const into = (description: string) => doc('wbc', [['13/09/2026', description + ' 1', '1000.00'], ['14/09/2026', description + ' 2', '1000.00']]);
    const ledger = reconcile([out, into('DEPOSIT-OSKO PAYMENT MARC')]), group = (account: string, date: string) => ledger.find(r => r.accountId === account && r.date === date)!.transferGroup;
    expect(ledger.every(r => r.transferGroup)).toBe(true);
    expect(group('cba', '2026-09-13')).toBe(group('wbc', '2026-09-13'));
    expect(group('cba', '2026-09-14')).toBe(group('wbc', '2026-09-14'));
    expect(reconcile([out, into('SYNTHETIC SHOP REFUND')]).every(r => !r.transferGroup)).toBe(true);
  });
});

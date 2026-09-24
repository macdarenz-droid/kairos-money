import {describe, expect, it} from 'vitest';
import {currency} from '../src/core/money';
import {keepToday} from '../src/intelligence/savings';
import {audit} from '../src/intelligence/audit';
import {notificationPlan} from '../src/intelligence/notifications';
import {openDebts} from '../src/intelligence/debt';
import type {Snapshot, Transaction} from '../src/intelligence/model';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash} from '../src/ingest/normalize';

const AUD = currency('AUD');
const TODAY = '2026-09-18';
const day = (offset: number) => new Date(Date.parse(TODAY) + offset * 86400000).toISOString().slice(0, 10);
function row(id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction {
  return {id, accountId: 'a', date, minor, currency: AUD, description: 'Synthetic shop', category: 'Groceries',
    kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over};
}
const snapshot = (transactions: Transaction[], over: Partial<Snapshot> = {}): Snapshot => ({
  asOf: TODAY, currency: AUD, accountIds: ['a'], transactions, coverage: [], pays: [],
  savings: {asideMinor: '0', accountIds: [], evidence: []}, ...over,
});
/** Ninety days: pay of $3,000 and rent of $1,000 every thirty days, a coffee most days. */
function month90(extra: Transaction[] = []): Transaction[] {
  const rows: Transaction[] = [];
  for (let n = 0; n < 3; n++) {
    rows.push(row(`pay${n}`, day(-89 + n * 30), '300000', {kind: 'income', category: 'Salary', description: 'Employer'}));
    rows.push(row(`rent${n}`, day(-88 + n * 30), '-100000', {description: 'Landlord', category: 'Housing'}));
  }
  for (let d = -85; d <= 0; d += 2) rows.push(row(`c${d}`, day(d), '-500', {kind: 'discretionary', category: 'Coffee & snacks', description: 'Cafe'}));
  return [...rows, ...extra];
}

describe('keep and spend today', () => {
  it('does not subtract a pending purchase that the balance already holds', () => {
    const rows = Array.from({length: 10}, (_, i) => row(`s${i}`, day(-2 - i * 2), '-10000'));
    // The $200 pending purchase is already out of the $4,800 balance; taking it off again would count it twice.
    const without = keepToday(snapshot(rows), '480000');
    const withPending = keepToday(snapshot([...rows, row('p', day(0), '-20000', {status: 'pending'})]), '480000');
    expect([withPending.spendTodayMinor, withPending.keepTodayMinor]).toEqual([without.spendTodayMinor, without.keepTodayMinor]);
  });
});

describe('the money audit', () => {
  it('does not call a recurring payment of unknown kind a subscription', () => {
    const unknown = [0, 1, 2].map(n => row(`u${n}`, day(-80 + n * 30), '-4000', {kind: 'unknown', category: 'Uncategorised', description: 'Mystery debit'}));
    expect(audit(snapshot(month90(unknown))).leaks.map(l => l.kind)).not.toContain('subscription');
    const streaming = [0, 1, 2].map(n => row(`v${n}`, day(-80 + n * 30), '-1500', {kind: 'discretionary', category: 'Subscriptions', description: 'Streamer'}));
    expect(audit(snapshot(month90(streaming))).leaks.map(l => l.kind)).toContain('subscription');
  });

  it('does not overstate a month when history is between four weeks and three months', () => {
    // 45 days of history hold two rents a month apart; that is one rent a month, not 1.33.
    const rows = [row('r1', day(-44), '-100000', {category: 'Housing'}), row('r2', day(-14), '-100000', {category: 'Housing'}),
      row('i1', day(-43), '300000', {kind: 'income', category: 'Salary'}), row('i2', day(-13), '300000', {kind: 'income', category: 'Salary'})];
    const result = audit(snapshot(rows));
    expect(result.cashFlow.essentialsMinor).toBe('100000');
    expect(result.cashFlow.incomeMinor).toBe('300000');
  });

  it('says fixed costs over the 60% line are the excess, not the total', () => {
    const heavy = [0, 1, 2].map(n => row(`h${n}`, day(-87 + n * 30), '-100000', {description: 'Insurer', category: 'Insurance'}));
    const fixed = audit(snapshot(month90(heavy))).findings.find(f => f.kind === 'fixed-costs')!;
    expect(fixed.label).toBe('Fixed costs over 60% of income');
    expect(fixed.annualMinor).toBe(((200000n - 180000n) * 12n).toString());
  });

  it('checks dated debt targets together, not one at a time', () => {
    const debt = (id: string) => ({id, name: id, balanceMinor: '1200000', annualRateBp: '0', minimumMinor: '1000', targetDate: '2027-07-18'});
    const targets = audit(snapshot(month90()), {debts: [debt('a'), debt('b')]}).targets;
    // Each needs about $1,190 a month over its minimum; the month frees about $1,980, so only the first fits.
    expect(targets.map(t => t.fits)).toEqual([true, false]);
  });
});

describe('opt-in reminders', () => {
  it('fire from recorded rows even when no statement covers today', () => {
    const bills = [0, 1, 2].map(n => row(`b${n}`, day(-73 + n * 29), '-2000', {description: 'Phone plan', category: 'Utilities'}));
    const notices = notificationPlan(snapshot(bills), {bill: true, unusual: false, price: false, digest: false});
    expect(notices.map(n => n.kind)).toEqual(['bill']);
  });
});

describe('debts in another currency', () => {
  it('are converted, not silently dropped', () => {
    const record = {id: 'd', name: 'Card', currency: 'PHP', balanceMinor: '4000000', annualRateBp: '2400', minimumMinor: '200000', closedAt: null};
    const rates = [{asOf: '2026-09-01', base: currency('PHP'), quote: AUD, rateE8: 2500000n, source: 'published'}];
    expect(openDebts([record], 'AUD', {rates, asOf: TODAY})).toEqual([{id: 'd', name: 'Card', balanceMinor: '100000', annualRateBp: '2400', minimumMinor: '5000', targetDate: null}]);
  });
});

describe('a split expense shown in another currency', () => {
  it('keeps its split, converted part by part to the exact total', async () => {
    const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    await repo.addAccount({id: 'a', name: 'Everyday', institution: '', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
    await repo.manual.save({id: 'x', kind: 'expense', accountId: 'a', destinationId: null, date: '2026-01-20', minor: '10000', description: 'Market', category: 'Groceries', notes: ''});
    await repo.splits.save(hash('manual-transaction:x:entry'), [{category: 'Groceries', minor: '6667'}, {category: 'Eating out', minor: '3333'}]);
    await repo.saveRates([{asOf: '2026-01-01', base: 'PHP', quote: 'AUD', rateE8: 2640000n, source: 'synthetic'}]);
    const [t] = (await repo.intelligence.snapshot('2026-01-31', 'PHP')).transactions;
    expect(t!.allocations?.map(p => p.category)).toEqual(['Groceries', 'Eating out']);
    expect(t!.allocations!.reduce((n, p) => n + BigInt(p.minor), 0n)).toBe(-BigInt(t!.minor));
  });
});

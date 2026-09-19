import {describe, expect, it} from 'vitest';
import {addMonths, monthsUntil, openDebts, paymentFor, payoff, type Debt} from '../src/intelligence/debt';
import {audit} from '../src/intelligence/audit';
import {currency} from '../src/core/money';
import type {Snapshot, Transaction} from '../src/intelligence/model';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';

/**
 * "I want to pay my debt in full amount, So im going to set the amount how much. Then the app will
 * analyse my transaction, all of them ... tell me something like: try to keep ($) amount of money."
 */
const debt = (over: Partial<Debt> = {}): Debt => ({id: 'loan', name: 'Synthetic loan', balanceMinor: '700000', annualRateBp: '0', minimumMinor: '0', ...over});

describe('the payment that clears a debt by a date', () => {
  it('counts only the months that have wholly passed, and lands on a real day', () => {
    expect(monthsUntil('2026-09-19', '2027-03-19')).toBe(6);
    expect(monthsUntil('2026-09-19', '2027-03-18')).toBe(5);
    expect(monthsUntil('2026-09-19', '2026-09-01')).toBe(0);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-09-19', 6)).toBe('2027-03-19');
    expect(addMonths('2026-11-30', 15)).toBe('2028-02-29');
  });
  it('is exact for an interest-free balance: the balance over the months', () => {
    expect(paymentFor(debt(), 10)).toBe('70000');
    expect(paymentFor(debt(), 1)).toBe('700000');
    expect(paymentFor(debt(), 0)).toBeNull();
    expect(paymentFor(debt({balanceMinor: '0'}), 3)).toBe('0');
  });
  it('is the smallest payment that lands inside the months when there is interest', () => {
    const card = debt({annualRateBp: '1999', balanceMinor: '500000'});
    const payment = paymentFor(card, 12)!;
    expect(payoff(card, payment).months).toBeLessThanOrEqual(12);
    expect(payoff(card, (BigInt(payment) - 1n).toString()).months ?? 99).toBeGreaterThan(12);
    expect(BigInt(payment)).toBeGreaterThan(500000n / 12n);
  });
  it('never goes below the minimum the lender takes', () => {
    expect(paymentFor(debt({minimumMinor: '100000'}), 10)).toBe('100000');
  });
});

const AUD = currency('AUD');
const day = (offset: number) => new Date(Date.UTC(2026, 8, 18) + offset * 86400000).toISOString().slice(0, 10);
function row(id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction {
  return {id, accountId: 'a', date, minor, currency: AUD, description: 'Synthetic', category: 'Groceries',
    kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over};
}
/** The household from the money-audit test: $4,000 a month in, rent and groceries out, $2,240 free. */
const household = (): Snapshot => ({
  asOf: day(0), currency: AUD, accountIds: ['a'], coverage: [], pays: [], savings: {asideMinor: '0', accountIds: [], evidence: []},
  transactions: [
    row('g-first', day(-89), '-12000'),
    ...[-84, -70, -56, -42, -28, -14].map((d, i) => row(`pay${i}`, day(d), '200000', {kind: 'income', category: 'Salary'})),
    ...[-80, -50, -20].map((d, i) => row(`rent${i}`, day(d), '-120000', {category: 'Housing'})),
    ...Array.from({length: 12}, (_, i) => row(`groc${i}`, day(-2 - i * 7), '-12000')),
  ],
});

describe('a debt with a date on it, in the audit', () => {
  it('says what to keep each month and each day, and that it fits the free money', () => {
    const a = audit(household(), {debts: [debt({targetDate: addMonths(day(0), 10)})], spendableMinor: '0'});
    expect(a.targets).toHaveLength(1);
    const t = a.targets[0]!;
    expect(t.months).toBe(10);
    expect(t.paymentMinor).toBe('70000'); expect(t.extraMinor).toBe('70000');
    expect(t.perDayMinor).toBe((70000n / 30n).toString());
    expect(t.perPayMinor).toBeNull();   // no payslips, so no pay cycle to scale to
    expect(t.fits).toBe(true); expect(t.earliest).toBeNull(); expect(t.status).toBe('ok');
    // The kept money is for the debt now, and at least what the date needs.
    expect(a.cashFlow.saveTo).toBe('debt');
    expect(BigInt(a.cashFlow.saveMinor)).toBeGreaterThanOrEqual(70000n);
    expect(a.debt?.extraMinor).toBe(a.cashFlow.saveMinor);
  });
  it('says when the date cannot be met from the free money, and the soonest one that can', () => {
    // $7,000 in two months is $3,500 a month against $2,240 free.
    const a = audit(household(), {debts: [debt({targetDate: addMonths(day(0), 2)})], spendableMinor: '0'});
    const t = a.targets[0]!;
    expect(t.fits).toBe(false);
    expect(t.paymentMinor).toBe('350000');
    expect(t.earliest).toBe(addMonths(day(0), payoff(debt(), a.cashFlow.freeMinor).months!));
    expect(a.cashFlow.saveTo).not.toBe('debt');
  });
  it('marks a date that has passed, and asks for the whole balance', () => {
    const t = audit(household(), {debts: [debt({targetDate: day(-1)})]}).targets[0]!;
    expect(t.status).toBe('past'); expect(t.paymentMinor).toBe('700000'); expect(t.fits).toBe(false);
  });
  it('lists nothing when no debt has a date', () => {
    expect(audit(household(), {debts: [debt()]}).targets).toEqual([]);
  });
});

describe('the target beside the debt record', () => {
  async function repo() {
    const {driver} = memoryDriver(); await migrate(driver); const r = repository(driver);
    return {r, driver};
  }
  const input = {id: 'loan', name: 'Synthetic loan', accountId: null, currency: AUD, balanceMinor: '700000', annualRateBp: '0', minimumMinor: '0', dueDay: null, openedAt: '2026-09-18'};
  it('is kept, read back, replaced and removed with the debt', async () => {
    const {r, driver} = await repo();
    await r.debts.save({...input, targetDate: '2027-07-01'});
    expect((await r.debts.list())[0]?.targetDate).toBe('2027-07-01');
    expect(openDebts(await r.debts.list(), 'AUD')[0]?.targetDate).toBe('2027-07-01');
    await r.debts.save({...input, targetDate: null});
    expect((await r.debts.list())[0]?.targetDate).toBeNull();
    await expect(r.debts.save({...input, targetDate: '2027-02-30'})).rejects.toThrow('pay this off by');
    await r.debts.save({...input, targetDate: '2027-07-01'});
    await r.debts.close('loan', '2026-12-01');
    expect(await driver.query("SELECT key FROM app_settings WHERE key LIKE 'debt-target:%'")).toHaveLength(0);
    await r.debts.save({...input, targetDate: '2027-07-01'});
    await r.debts.remove('loan');
    expect(await driver.query("SELECT key FROM app_settings WHERE key LIKE 'debt-target:%'")).toHaveLength(0);
  });
});

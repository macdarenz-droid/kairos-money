import {describe, expect, it} from 'vitest';
import {dueDebts, nextDueDate, plan, ratePercent} from '../src/intelligence/debt';
import {DUE_SOON_DAYS, surfaces} from '../src/intelligence/surfaces';
import type {Snapshot} from '../src/intelligence/model';

const snapshot = (asOf: string): Snapshot =>
  ({asOf, currency: 'AUD', accountIds: ['a1'], transactions: [], coverage: [], pays: []});

describe('the day of the month a payment is due', () => {
  it('finds the day later this month', () => {
    expect(nextDueDate(15, '2026-09-01')).toBe('2026-09-15');
  });

  it('counts today as due today, not as a month away', () => {
    expect(nextDueDate(15, '2026-09-15')).toBe('2026-09-15');
  });

  it('rolls into next month once the day has passed', () => {
    expect(nextDueDate(15, '2026-09-16')).toBe('2026-10-15');
  });

  it('rolls across the end of the year', () => {
    expect(nextDueDate(3, '2026-12-04')).toBe('2027-01-03');
  });

  /**
   * The thirty-first does not exist in eleven months of the year, and a lender does not skip those
   * months — the payment lands on the last day instead. A date this app invented, like 2027-02-31, would
   * throw; a date it silently moved to March would be a month late.
   */
  it('clamps to the last day of a short month', () => {
    expect(nextDueDate(31, '2027-02-01')).toBe('2027-02-28');
    expect(nextDueDate(31, '2028-02-01')).toBe('2028-02-29');
    expect(nextDueDate(31, '2026-09-01')).toBe('2026-09-30');
  });

  it('refuses a day that is not a day of the month', () => {
    expect(() => nextDueDate(0, '2026-09-01')).toThrow();
    expect(() => nextDueDate(32, '2026-09-01')).toThrow();
  });
});

describe('which debts are due soon', () => {
  const card = {id: 'card', name: 'Synthetic card', minimumMinor: '10000', dueDay: 18};
  const loan = {id: 'loan', name: 'Synthetic loan', minimumMinor: '25000', dueDay: 2};
  const friend = {id: 'friend', name: 'Money owed to a friend', minimumMinor: '5000', dueDay: null};

  it('includes one inside the window and leaves out one outside it', () => {
    expect(dueDebts([card, loan], '2026-09-17', 3).map(d => d.id)).toEqual(['card']);
  });

  /** No date was given, so the app has none. Inventing one would be the app making something up. */
  it('never invents a date for a debt that has none', () => {
    expect(dueDebts([friend], '2026-09-17', 30)).toEqual([]);
  });

  it('orders by date, then by id, so the same ledger draws the same screen', () => {
    const also = {id: 'another', name: 'Another card', minimumMinor: '1000', dueDay: 18};
    expect(dueDebts([card, also], '2026-09-17', 3).map(d => d.id)).toEqual(['another', 'card']);
  });
});

describe('the debt surface on Today', () => {
  const card = {id: 'card', name: 'Synthetic card', minimumMinor: '10000', dueDay: 18};
  const far = {id: 'far', name: 'Synthetic loan', minimumMinor: '25000', dueDay: 2};

  /**
   * A debt is true every day of the year. If the surface fired on "you have a debt" it would be on the
   * home screen permanently, and a permanent thing is one nobody reads. Only the PAYMENT has a date.
   */
  it('stays silent when no payment is near', () => {
    expect(surfaces(snapshot('2026-09-17'), [], undefined, [far])).toEqual([]);
  });

  it('stays silent when there are no debts at all', () => {
    expect(surfaces(snapshot('2026-09-17'), [], undefined, [])).toEqual([]);
  });

  it('appears in the days before the payment, with the total of the minimums', () => {
    const [shown, ...rest] = surfaces(snapshot('2026-09-17'), [], undefined, [card, far]);
    expect(rest).toEqual([]);
    expect(shown?.id).toBe('debt-due');
    expect(shown?.urgency).toBe(3);
    expect(shown?.data['minor']).toBe('10000');
    expect(shown?.data['date']).toBe('2026-09-18');
  });

  it('uses the same three days as a bill does', () => {
    const asOf = '2026-09-17';
    const inside = {id: 'in', name: 'Just inside', minimumMinor: '100', dueDay: 20};
    const outside = {id: 'out', name: 'Just outside', minimumMinor: '100', dueDay: 21};
    expect(DUE_SOON_DAYS).toBe(3);
    expect(surfaces(snapshot(asOf), [], undefined, [inside])).toHaveLength(1);
    expect(surfaces(snapshot(asOf), [], undefined, [outside])).toEqual([]);
  });
});

describe('the burn-down a plan can be drawn from', () => {
  const debts = [
    {id: 'card', name: 'Card', balanceMinor: '300000', annualRateBp: '2400', minimumMinor: '10000'},
    {id: 'loan', name: 'Loan', balanceMinor: '500000', annualRateBp: '800', minimumMinor: '20000'},
  ];

  it('gives one total for every month it runs, ending at zero', () => {
    const p = plan(debts, '100000', 'avalanche');
    expect(p.months).not.toBeNull();
    expect(p.balances).toHaveLength(p.months!);
    expect(p.balances.at(-1)).toBe('0');
  });

  it('never rises: a plan that clears debts only ever owes less', () => {
    const p = plan(debts, '100000', 'avalanche');
    for (let i = 1; i < p.balances.length; i++) expect(BigInt(p.balances[i]!) < BigInt(p.balances[i - 1]!)).toBe(true);
  });

  it('has nothing to draw when there is nothing owed', () => {
    expect(plan([], '100000', 'avalanche').balances).toEqual([]);
  });
});

describe('a rate written the way people write it', () => {
  /** Truncating a rate always flatters the lender, and this screen exists to say what a debt costs. */
  it('keeps the halves and hundredths that truncation would throw away', () => {
    expect(ratePercent('2400')).toBe('24%');
    expect(ratePercent('1150')).toBe('11.5%');
    expect(ratePercent('1999')).toBe('19.99%');
    expect(ratePercent('1905')).toBe('19.05%');
    expect(ratePercent('0')).toBe('0%');
    expect(ratePercent('5')).toBe('0.05%');
  });
});

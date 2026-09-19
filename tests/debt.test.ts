import {describe, expect, it} from 'vitest';
import {compare, HORIZON_MONTHS, payoff, plan, type Debt} from '../src/intelligence/debt';

/**
 * A payoff projection is the app making a claim about someone's next few years, so the tests are mostly
 * about the claims it must REFUSE to make.
 */
const debt = (id: string, balanceMinor: string, annualRateBp: string, minimumMinor = '0'): Debt =>
  ({id, name: id, balanceMinor, annualRateBp, minimumMinor});

describe('one debt, one payment', () => {
  it('clears an interest-free balance in exact whole payments', () => {
    const p = payoff(debt('a', '100000', '0'), '25000');
    expect(p.months).toBe(4);
    expect(p.interestMinor).toBe('0');
    expect(p.balances).toEqual(['75000', '50000', '25000', '0']);
  });

  it('never overshoots on the final payment', () => {
    // Paying 30000 against a last 10000 owes 10000, not 30000. Overshooting would invent a balance.
    const p = payoff(debt('a', '100000', '0'), '30000');
    expect(p.months).toBe(4);
    expect(p.balances.at(-1)).toBe('0');
  });

  it('rounds interest up, so the projection is never cheaper than the arithmetic', () => {
    // 1000 minor at 19.99% for one month is 1000 × 1999 / 120000 = 16.658… minor units. It charges
    // 17, not 16. Over a long plan the rounding costs a few minor units in total and always in the
    // direction of telling the truth.
    const p = payoff(debt('a', '1000', '1999'), '100000');
    expect(p.months).toBe(1);
    expect(p.interestMinor).toBe('17');
  });

  it('refuses a date when the payment does not cover the interest', () => {
    // The balance grows every month. "412 months" would be dressing up "never" as a plan.
    const p = payoff(debt('a', '10000000', '2400'), '10000');
    expect(p.months).toBeNull();
    expect(p.growing).toBe(true);
    // It still reports what one month costs, so the screen can say what standing still would take:
    // 10,000,000 × 2400 / 120000 = 200,000 a month, against a payment of 10,000.
    expect(p.interestMinor).toBe('200000');
  });

  it('treats a payment exactly equal to the interest as never clearing', () => {
    // Paying precisely the interest holds the balance still forever. That is not a payoff.
    const p = payoff(debt('a', '1200000', '1200'), '12000');
    expect(p.months).toBeNull();
    expect(p.growing).toBe(true);
  });

  it('says nothing is owed when nothing is owed', () => {
    expect(payoff(debt('a', '0', '2000'), '10000')).toMatchObject({months: 0, interestMinor: '0'});
  });

  it('gives up rather than projecting past the horizon', () => {
    const p = payoff(debt('a', '100000000', '1900'), '1600000');
    if (p.months !== null) expect(p.months).toBeLessThanOrEqual(HORIZON_MONTHS);
  });

  it('rejects impossible inputs instead of guessing', () => {
    expect(() => payoff(debt('a', '-1', '1000'), '100')).toThrow();
    expect(() => payoff(debt('a', '1000', '-1'), '100')).toThrow();
  });
});

describe('several debts, one budget', () => {
  // A small one at a punishing rate, and a large one at a mild rate: the case where the two
  // strategies actually disagree.
  const debts = [
    debt('card', '300000', '2400', '10000'),
    debt('loan', '1500000', '600', '30000'),
  ];

  it('clears every debt and names the order', () => {
    const p = plan(debts, '80000', 'avalanche');
    expect(p.months).not.toBeNull();
    expect(p.order).toEqual(['card', 'loan']);
  });

  it('attacks the dearest debt first on avalanche and the smallest first on snowball', () => {
    // Here they agree on order, which is the point of the next test: they still differ in cost when
    // the smallest is not the dearest.
    const spread = [debt('small', '50000', '500', '5000'), debt('dear', '400000', '2900', '10000')];
    expect(plan(spread, '60000', 'avalanche').order[0]).toBe('dear');
    expect(plan(spread, '60000', 'snowball').order[0]).toBe('small');
  });

  it('costs less to pay the dearest first, and says by how much', () => {
    const spread = [debt('small', '50000', '500', '5000'), debt('dear', '400000', '2900', '10000')];
    const {avalanche, snowball, savedMinor} = compare(spread, '60000');
    expect(BigInt(avalanche.interestMinor)).toBeLessThan(BigInt(snowball.interestMinor));
    expect(BigInt(savedMinor)).toBeGreaterThan(0n);
  });

  it('rolls a cleared debt onto the next rather than pocketing it', () => {
    // If the freed-up payment were dropped, the second debt would take as long as it would alone.
    const rolled = plan(debts, '80000', 'avalanche').months!;
    const alone = payoff(debt('loan', '1500000', '600'), '30000').months!;
    expect(rolled).toBeLessThan(alone);
  });

  it('refuses a budget that cannot even cover the minimums', () => {
    expect(() => plan(debts, '20000', 'avalanche')).toThrow(/minimum/i);
  });

  it('gives the same debts the same plan every time', () => {
    expect(plan(debts, '80000', 'avalanche')).toEqual(plan([...debts].reverse(), '80000', 'avalanche'));
  });

  it('has nothing to plan when nothing is owed', () => {
    expect(plan([debt('a', '0', '2000', '0')], '10000', 'avalanche')).toMatchObject({months: 0, order: []});
  });
});

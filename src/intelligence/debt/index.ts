import {day} from '../model';

/**
 * WHAT A DEBT COSTS, AND WHEN IT ENDS.
 *
 * Kairos has had "Debt" as a category name and "loan" as an account type. Neither knows a rate, so
 * neither can answer the only two questions anybody actually has: when am I free of this, and what is
 * it costing me to still be carrying it.
 *
 * EVERY FIGURE HERE IS A PROJECTION, and the code is built so it can never be mistaken for a promise.
 * Interest is rounded UP at each step, so the answer is never rosier than reality; a projection that
 * flatters is worse than none. And a payment that does not cover the interest returns null rather than
 * a very large number of months — a balance that grows has no payoff date, and saying "412 months"
 * would dress up "never" as a plan.
 */

/** Annual rate in basis points: 1999 is 19.99%. A rate is a ratio, so it is not money and not a float. */
export type Debt = {
  id: string;
  name: string;
  /** What is owed, as a positive amount in minor units. */
  balanceMinor: string;
  annualRateBp: string;
  /** The smallest payment the lender accepts each month. */
  minimumMinor: string;
};

export type Payoff = {
  /** null when the payment never clears it. */
  months: number | null;
  /** Interest paid over the life of the plan, or over the horizon when it never clears. */
  interestMinor: string;
  /** Balance at the end of each month, for drawing. Capped at the horizon. */
  balances: string[];
  /** True when the payment does not even cover one month's interest, so the balance grows. */
  growing: boolean;
};

/** Beyond this the answer is "not on this payment", not a number of years. */
export const HORIZON_MONTHS = 600;

/** Rounds up, so a projection is never cheaper than the arithmetic. */
function monthlyInterest(balanceMinor: bigint, annualRateBp: bigint): bigint {
  if (balanceMinor <= 0n || annualRateBp <= 0n) return 0n;
  const numerator = balanceMinor * annualRateBp;
  const denominator = 120000n;   // 10000 basis points × 12 months
  return (numerator + denominator - 1n) / denominator;
}

/**
 * One debt, one fixed monthly payment.
 *
 * @param paymentMinor what is actually paid each month, which may be more than the minimum
 */
export function payoff(debt: Debt, paymentMinor: string): Payoff {
  let balance = BigInt(debt.balanceMinor);
  const payment = BigInt(paymentMinor), rate = BigInt(debt.annualRateBp);
  if (balance < 0n || payment < 0n || rate < 0n) throw new Error('A debt takes non-negative amounts and a non-negative rate.');
  if (balance === 0n) return {months: 0, interestMinor: '0', balances: [], growing: false};

  const first = monthlyInterest(balance, rate);
  if (payment <= first) {
    // Not a payoff plan at all. Report the first month's interest so the screen can say what it would
    // take to stand still, and refuse to produce a date.
    return {months: null, interestMinor: first.toString(), balances: [], growing: true};
  }

  const balances: string[] = [];
  let interest = 0n;
  for (let month = 1; month <= HORIZON_MONTHS; month++) {
    const charge = monthlyInterest(balance, rate);
    interest += charge;
    balance = balance + charge - payment;
    if (balance <= 0n) {
      // The final payment is only the part that was still owed; overshooting would invent interest.
      balances.push('0');
      return {months: month, interestMinor: interest.toString(), balances, growing: false};
    }
    balances.push(balance.toString());
  }
  return {months: null, interestMinor: interest.toString(), balances, growing: false};
}

export type Strategy = 'avalanche' | 'snowball';

export type Plan = {
  strategy: Strategy;
  months: number | null;
  interestMinor: string;
  /** The order debts are cleared in, by id. */
  order: string[];
  /** Total still owed at the end of each month, for drawing the burn-down. */
  balances: string[];
  growing: boolean;
};

/**
 * Several debts, one monthly budget.
 *
 * Minimums are paid on everything; whatever is left goes at ONE debt until it clears, then rolls onto
 * the next. That rolling is the whole reason either strategy beats paying minimums forever.
 *
 * The two orderings are the two that people actually use, and they answer different questions:
 *   avalanche — highest rate first. Costs the least. This is simply arithmetic.
 *   snowball  — smallest balance first. Clears a whole debt soonest, which is why people stick with it.
 * The app computes both and states the difference. Which one is right depends on whether you are more
 * likely to be defeated by the interest or by the waiting, and the app does not know that about you.
 */
export function plan(debts: readonly Debt[], budgetMinor: string, strategy: Strategy): Plan {
  const budget = BigInt(budgetMinor);
  if (budget < 0n) throw new Error('A monthly budget cannot be negative.');
  const live = debts.filter(d => BigInt(d.balanceMinor) > 0n)
    .map(d => ({...d, balance: BigInt(d.balanceMinor), rate: BigInt(d.annualRateBp), minimum: BigInt(d.minimumMinor)}));
  if (!live.length) return {strategy, months: 0, interestMinor: '0', order: [], balances: [], growing: false};

  const minimums = live.reduce((total, d) => total + d.minimum, 0n);
  if (budget < minimums) throw new Error('The monthly budget is below the total of the minimum payments.');

  const order: string[] = [], balances: string[] = [];
  let interest = 0n;
  for (let month = 1; month <= HORIZON_MONTHS; month++) {
    const open = live.filter(d => d.balance > 0n);
    if (!open.length) return {strategy, months: month - 1, interestMinor: interest.toString(), order, balances, growing: false};

    for (const d of open) { const charge = monthlyInterest(d.balance, d.rate); interest += charge; d.balance += charge; }

    // Ties break by id, so the same debts always produce the same plan.
    const target = [...open].sort((a, b) => strategy === 'avalanche'
      ? (b.rate > a.rate ? 1 : b.rate < a.rate ? -1 : a.id.localeCompare(b.id))
      : (a.balance > b.balance ? 1 : a.balance < b.balance ? -1 : a.id.localeCompare(b.id)))[0]!;

    let spare = budget;
    for (const d of open) {
      if (d === target) continue;
      const pay = d.minimum < d.balance ? d.minimum : d.balance;
      d.balance -= pay; spare -= pay;
      if (d.balance === 0n) order.push(d.id);
    }
    const pay = spare < target.balance ? spare : target.balance;
    if (pay <= 0n) return {strategy, months: null, interestMinor: interest.toString(), order, balances, growing: true};
    target.balance -= pay;
    if (target.balance === 0n) order.push(target.id);
    balances.push(live.reduce((total, d) => total + d.balance, 0n).toString());
  }
  return {strategy, months: null, interestMinor: interest.toString(), order, balances, growing: false};
}

/** What choosing the cheaper ordering is worth, in money and in months. */
export function compare(debts: readonly Debt[], budgetMinor: string) {
  const avalanche = plan(debts, budgetMinor, 'avalanche');
  const snowball = plan(debts, budgetMinor, 'snowball');
  const savedMinor = (BigInt(snowball.interestMinor) - BigInt(avalanche.interestMinor)).toString();
  return {avalanche, snowball, savedMinor,
    savedMonths: avalanche.months !== null && snowball.months !== null ? snowball.months - avalanche.months : null};
}

/**
 * WHEN THE NEXT PAYMENT IS DUE.
 *
 * A lender sets a day of the month, not a date, and the two are not the same thing: a card due on the
 * 31st is due on the 30th in April and on the 28th or 29th in February. Clamping to the last day of the
 * month is what lenders actually do, and guessing otherwise would put a mark on a day that does not
 * exist.
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The first occurrence of `dueDay` on or after `asOf`. */
export function nextDueDate(dueDay: number, asOf: string): string {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error('A due day is a day of the month.');
  day(asOf);
  let year = Number(asOf.slice(0, 4)), month = Number(asOf.slice(5, 7));
  // Two passes is always enough: a clamped day in a LATER month cannot be earlier than a date in this one.
  for (let step = 0; step < 2; step++) {
    const clamped = Math.min(dueDay, lastDayOfMonth(year, month));
    const date = `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
    if (date >= asOf) return date;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  throw new Error('A due day could not be placed on the calendar.');
}

/** A debt only needs its payment schedule to answer "is something due soon". */
export type Scheduled = {id: string; name: string; minimumMinor: string; dueDay: number | null};

export type DebtDue = {id: string; name: string; minimumMinor: string; date: string; offset: number};

/**
 * Debts whose payment day falls within the next `withinDays`.
 *
 * A debt with no due day is skipped rather than assumed: money owed to a friend has no date, and
 * inventing one would make the app confident about something nobody told it.
 */
export function dueDebts(debts: readonly Scheduled[], asOf: string, withinDays: number): DebtDue[] {
  const asOfDay = day(asOf);
  return debts
    .flatMap(d => {
      if (d.dueDay === null) return [];
      const date = nextDueDate(d.dueDay, asOf);
      const offset = day(date) - asOfDay;
      return offset <= withinDays ? [{id: d.id, name: d.name, minimumMinor: d.minimumMinor, date, offset}] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/**
 * A rate as people write it, from basis points, without ever touching a float.
 *
 * 1150 basis points is 11.5%, and the first version of the debt list printed it as "11%" — a rate
 * rounded DOWN by half a point, on the one screen whose job is to say what a debt costs. Truncating a
 * rate always flatters the lender.
 */
export function ratePercent(annualRateBp: string): string {
  const bp = BigInt(annualRateBp);
  const whole = bp / 100n, rest = bp % 100n;
  if (rest === 0n) return `${whole}%`;
  return `${whole}.${rest.toString().padStart(2, '0').replace(/0$/, '')}%`;
}

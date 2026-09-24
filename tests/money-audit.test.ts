import {describe, expect, it} from 'vitest';
import {audit, MIN_DAYS} from '../src/intelligence/audit';
import {currency} from '../src/core/money';
import type {Snapshot, Transaction} from '../src/intelligence/model';
import type {Debt} from '../src/intelligence/debt';

/**
 * "could we implement this in the app? ... i want a generalized context for diff user."
 *
 * Five chatbot prompts — money audit, money leaks, cash flow, debt, wealth plan — answered from the
 * ledger alone. The fixture is a household, not a person: fortnightly pay, rent, groceries, one
 * streaming bill, a coffee habit, a bank fee and a card. Nothing in it is read off anyone's statement.
 */
const AUD = currency('AUD');
const day = (offset: number) => new Date(Date.UTC(2026, 8, 18) + offset * 86400000).toISOString().slice(0, 10);
const TODAY = day(0);

function row(id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction {
  return {id, accountId: 'a', date, minor, currency: AUD, description: 'Synthetic', category: 'Groceries',
    kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over};
}
const snapshot = (transactions: Transaction[], over: Partial<Snapshot> = {}): Snapshot => ({
  asOf: TODAY, currency: AUD, accountIds: ['a'], transactions, coverage: [], pays: [],
  savings: {asideMinor: '0', accountIds: [], evidence: []}, ...over,
});

/** Ninety days of an ordinary household. */
function household(): Transaction[] {
  return [
    row('g-first', day(-89), '-12000'),
    ...[-84, -70, -56, -42, -28, -14].map((d, i) => row(`pay${i}`, day(d), '200000', {kind: 'income', category: 'Salary', description: 'Synthetic pay'})),
    ...[-80, -50, -20].map((d, i) => row(`rent${i}`, day(d), '-120000', {category: 'Housing', description: 'Synthetic rent'})),
    ...Array.from({length: 12}, (_, i) => row(`groc${i}`, day(-2 - i * 7), '-12000')),
    ...[-75, -45, -15].map((d, i) => row(`stream${i}`, day(d), '-1599', {kind: 'discretionary', category: 'Subscriptions', description: 'Synthetic streaming'})),
    // Every second day across the whole window: a habit, not a new one. Bunched into the last month it
    // would be lifestyle creep, and the detector below is right to say so.
    ...Array.from({length: 45}, (_, i) => row(`coffee${i}`, day(-1 - i * 2), '-450', {kind: 'discretionary', category: 'Coffee & snacks', description: 'Synthetic cafe'})),
    row('fee', day(-10), '-500', {kind: 'discretionary', category: 'Bank fees', description: 'Synthetic fee'}),
  ];
}
const card: Debt = {id: 'card', name: 'Synthetic card', balanceMinor: '500000', annualRateBp: '1999', minimumMinor: '15000'};

describe('the money audit', () => {
  it('says nothing until four weeks of history exist', () => {
    const short = Array.from({length: MIN_DAYS - 2}, (_, i) => row(`s${i}`, day(-i), '-1000'));
    expect(audit(snapshot(short)).status).toBe('not_yet');
    expect(audit(snapshot([])).status).toBe('not_yet');
  });

  it('states a month of income from what landed, over the ninety days it can see', () => {
    const a = audit(snapshot(household()));
    expect(a.status).toBe('ok');
    expect(a.window.days).toBe(90);
    // Six fortnightly pays of $2,000 over ninety days is $4,000 a month.
    expect(a.cashFlow.incomeMinor).toBe('400000');
    expect(a.cashFlow.incomeSource).toBe('ledger');
  });

  it('gives every unit of income a purpose: keep, save, spend — and they add up', () => {
    const {cashFlow} = audit(snapshot(household()), {debts: [card], spendableMinor: '50000'});
    expect(cashFlow.status).toBe('ok');
    const kept = BigInt(cashFlow.essentialsMinor) + BigInt(cashFlow.minimumsMinor);
    expect(kept + BigInt(cashFlow.saveMinor) + BigInt(cashFlow.spendMinor)).toBe(BigInt(cashFlow.incomeMinor));
    // A fifth of income, the published share, since the free money covers it.
    expect(cashFlow.saveMinor).toBe('80000');
    expect(cashFlow.minimumsMinor).toBe('15000');
    // Nothing in the buffer yet, so that is where the kept fifth goes first.
    expect(cashFlow.saveTo).toBe('buffer');
    // Pay yourself first: the fortnight's share of the month's keep, on the next pay date.
    expect(cashFlow.automate.date).toBe(day(14));
    expect(cashFlow.automate.minor).toBe((80000n * 14n / 30n).toString());
  });

  it('ranks the leaks by what they cost a year, with the effort each one takes', () => {
    const {leaks} = audit(snapshot(household()));
    expect(leaks.map(l => l.kind)).toEqual(['small-purchases', 'subscription', 'bank-fees']);
    const small = leaks[0]!, subs = leaks[1]!;
    expect(small.count).toBe(45);
    // Forty-five coffees at $4.50 over ninety days is $67.50 a month, $810 a year.
    expect(small.annualMinor).toBe('81000');
    expect(small.effort).toBe('medium');
    expect(subs.count).toBe(1);
    // $15.99 every thirty days.
    expect(subs.annualMinor).toBe((1599n * 12n).toString());
    expect(subs.effort).toBe('low');
  });

  it('puts what the debt costs a year at the top of the audit when it is the biggest number', () => {
    const {findings} = audit(snapshot(household()), {debts: [card]});
    expect(findings[0]).toMatchObject({kind: 'debt-interest', annualMinor: (500000n * 1999n / 10000n).toString()});
    for (let i = 1; i < findings.length; i++) expect(BigInt(findings[i - 1]!.annualMinor) >= BigInt(findings[i]!.annualMinor)).toBe(true);
  });

  it('names fixed costs as a finding only past the line the home screen already uses', () => {
    const heavy = [...household(), ...[-70, -40, -10].map((d, i) => row(`big${i}`, day(d), '-200000', {category: 'Housing'}))];
    const {findings, cashFlow} = audit(snapshot(heavy));
    expect(findings.some(f => f.kind === 'fixed-costs')).toBe(true);
    expect(BigInt(cashFlow.freeMinor)).toBeLessThan(BigInt(cashFlow.incomeMinor) * 4000n / 10000n);
    expect(audit(snapshot(household())).findings.some(f => f.kind === 'fixed-costs')).toBe(false);
  });

  it('sees lifestyle creep when the last month spends more per day than the two before it', () => {
    const creeping = [
      ...household(),
      ...Array.from({length: 30}, (_, i) => row(`more${i}`, day(-i), '-8000', {kind: 'discretionary', category: 'Shopping'})),
    ];
    const creep = audit(snapshot(creeping)).leaks.find(l => l.kind === 'lifestyle-creep');
    expect(creep).toBeDefined();
    expect(creep!.effort).toBe('high');
    expect(BigInt(creep!.monthlyMinor)).toBeGreaterThan(0n);
    expect(audit(snapshot(household())).leaks.some(l => l.kind === 'lifestyle-creep')).toBe(false);
  });

  it('walks the roadmap in the standard order and marks where this ledger stands', () => {
    const empty = audit(snapshot(household()), {debts: [card], spendableMinor: '50000'});
    expect(empty.roadmap.map(s => `${s.id}:${s.status}`)).toEqual([
      'buffer-1:now', 'high-interest:later', 'buffer-3:later', 'save-20:later', 'invest-10:later']);
    // A month of essentials in hand: the buffer is done and the 19.99% card is what comes next.
    const buffered = audit(snapshot(household()), {debts: [card], spendableMinor: '200000'});
    const steps = Object.fromEntries(buffered.roadmap.map(s => [s.id, s]));
    expect(steps['buffer-1']!.status).toBe('done');
    expect(steps['high-interest']!.status).toBe('now');
    expect(typeof steps['high-interest']!.months).toBe('number');
    expect(buffered.cashFlow.saveTo).toBe('debt');
    // And the kept fifth now goes at the card on top of the minimum.
    expect(buffered.debt?.extraMinor).toBe('80000');
    expect(buffered.debt!.cheaper.months).toBeLessThan(empty.debt!.cheaper.months!);
  });

  it('computes both debt orderings and keeps the cheaper one, saying what the other costs', () => {
    const loan: Debt = {id: 'loan', name: 'Synthetic loan', balanceMinor: '300000', annualRateBp: '800', minimumMinor: '10000'};
    const a = audit(snapshot(household()), {debts: [card, loan], spendableMinor: '200000'});
    expect(a.debt).not.toBeNull();
    expect(a.debt!.count).toBe(2);
    expect(a.debt!.cheaper.strategy).toBe('avalanche');
    expect(a.debt!.other.strategy).toBe('snowball');
    expect(BigInt(a.debt!.savedMinor)).toBeGreaterThan(0n);
    expect(BigInt(a.debt!.cheaper.interestMinor)).toBeLessThan(BigInt(a.debt!.other.interestMinor));
  });

  it('says so when there is no income to plan against, without pretending otherwise', () => {
    const noPay = household().filter(t => t.kind !== 'income');
    const a = audit(snapshot(noPay));
    expect(a.status).toBe('ok');
    expect(a.cashFlow.status).toBe('no_income');
    expect(a.cashFlow.saveMinor).toBe('0');
    expect(a.roadmap.find(s => s.id === 'save-20')!.status).toBe('unknown');
    expect(a.income).toBe('unknown');
  });
});

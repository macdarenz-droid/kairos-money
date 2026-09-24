import {describe, expect, it} from 'vitest';
import fc from 'fast-check';
import {currency} from '../src/core/money';
import {think, summary} from '../src/brain';
import {spendingRows, out} from '../src/brain/shared';
import type {BrainInputs} from '../src/brain/types';
import type {Snapshot, Transaction} from '../src/intelligence/model';
import {fixture} from './intelligence-fixtures';

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
const inputs = (s: Snapshot, over: Partial<BrainInputs> = {}): BrainInputs => ({
  snapshot: s, holdings: {spendableMinor: '500000', savedMinor: '0'}, bufferMinor: '0', debts: [], scheduled: [],
  cancelled: new Set(), dismissals: {}, ...over,
});
/** Ninety days by hand: pay, rent, coffees and a few small shops; no statements at all. */
function handEntered(extra: Transaction[] = []): Transaction[] {
  const rows: Transaction[] = [];
  for (let n = 0; n < 3; n++) {
    rows.push(row(`pay${n}`, day(-89 + n * 30), '300000', {kind: 'income', category: 'Salary', description: 'Employer'}));
    rows.push(row(`rent${n}`, day(-88 + n * 30), '-100000', {description: 'Landlord', category: 'Housing'}));
  }
  for (let d = -85; d <= 0; d += 2) rows.push(row(`c${d}`, day(d), '-450', {kind: 'discretionary', category: 'Coffee & snacks', description: 'Cafe'}));
  return [...rows, ...extra];
}

describe('the brain', () => {
  it('counts every category part as money out, and never pending rows or transfers', () => {
    const arbitraryRow = fc.record({
      offset: fc.integer({min: -40, max: 0}), minor: fc.bigInt({min: -50000n, max: 50000n}).filter(v => v !== 0n),
      status: fc.constantFrom('settled' as const, 'pending' as const), transfer: fc.boolean(), split: fc.boolean(),
      kind: fc.constantFrom('essential' as const, 'discretionary' as const, 'unknown' as const, 'income' as const),
    });
    fc.assert(fc.property(fc.array(arbitraryRow, {maxLength: 40}), list => {
      const rows = list.map((r, i) => {
        const minor = r.minor.toString();
        const parts = r.split && r.minor < -1n && r.status === 'settled' && !r.transfer
          ? [{category: 'Groceries', kind: 'essential' as const, minor: (-r.minor / 2n).toString()}, {category: 'Eating out', kind: 'discretionary' as const, minor: (-r.minor - -r.minor / 2n).toString()}]
          : undefined;
        return row(`r${i}`, day(r.offset), minor, {status: r.status, transfer: r.transfer, kind: r.kind, ...(parts ? {allocations: parts} : {})});
      });
      const brain = think(inputs(snapshot(rows)));
      const categories = brain.spending.categories.reduce((n, c) => n + BigInt(c.minor), 0n);
      const expected = rows.filter(t => t.status === 'settled' && !t.transfer && BigInt(t.minor) < 0n && t.date >= brain.spending.window.start)
        .reduce((n, t) => n - BigInt(t.minor), 0n);
      expect(categories).toBe(expected);
      expect(out(spendingRows(snapshot(rows), brain.spending.window.start, TODAY))).toBe(expected);
    }), {numRuns: 60, seed: 42});
  });

  it('labels hand-entered history instead of hiding it', () => {
    const brain = think(inputs(snapshot(handEntered())));
    expect(brain.tier).toBe('recorded');
    expect(BigInt(brain.spending.thisMonth.outMinor)).toBeGreaterThan(0n);
    expect(brain.spending.categories.map(c => c.category)).toContain('Coffee & snacks');
    expect(brain.plan.status).toBe('ok');
  });

  it('is deterministic', () => {
    const s = snapshot(handEntered());
    expect(JSON.stringify(think(inputs(s)))).toBe(JSON.stringify(think(inputs(s))));
  });

  it('hides advice and plan while triage is active', () => {
    const fees = [row('f1', day(-10), '-1500', {overdraftFee: true, category: 'Bank fees', kind: 'discretionary'}), row('f2', day(-3), '-1500', {overdraftFee: true, category: 'Bank fees', kind: 'discretionary'})];
    const brain = think(inputs(snapshot(handEntered(fees)), {holdings: {spendableMinor: '1000', savedMinor: '0'}}));
    expect(brain.triage).toMatchObject({active: true, reasons: ['low-buffer', 'repeated-overdraft-fees']});
    expect(brain.advice).toEqual([]);
    expect(brain.plan.status).toBe('hidden');
    expect(brain.plan.leaks).toEqual([]);
  });

  it('gives at most three pieces of advice, and honours dismissals', () => {
    const smalls = Array.from({length: 12}, (_, i) => row(`s${i}`, day(-i * 3), '-900', {kind: 'discretionary', category: 'Shopping', description: `Shop ${i}`}));
    const brain = think(inputs(snapshot(handEntered(smalls))));
    expect(brain.advice.length).toBeGreaterThan(0);
    expect(brain.advice.length).toBeLessThanOrEqual(3);
    const rule = brain.advice[0]!.rule;
    const once = think(inputs(snapshot(handEntered(smalls)), {dismissals: {[rule]: {count: 1, last: TODAY}}}));
    expect(once.advice.map(a => a.rule)).not.toContain(rule);
    const later = think(inputs(snapshot(handEntered(smalls)), {dismissals: {[rule]: {count: 1, last: day(-60)}}}));
    expect(later.advice.map(a => a.rule)).toContain(rule);
    const twice = think(inputs(snapshot(handEntered(smalls)), {dismissals: {[rule]: {count: 2, last: day(-300)}}}));
    expect(twice.advice.map(a => a.rule)).not.toContain(rule);
  });

  it('only calls a recent charge unusual', () => {
    const visits = [-60, -50, -40, -30, -20].map((d, i) => row(`v${i}`, day(d), '-2000', {kind: 'discretionary', category: 'Eating out', description: 'Diner'}));
    const spike = (offset: number) => row('spike', day(offset), '-30000', {kind: 'discretionary', category: 'Eating out', description: 'Diner'});
    expect(think(inputs(snapshot(handEntered([...visits, spike(-2)])))).attention.map(a => a.kind)).toContain('unusual-charge');
    expect(think(inputs(snapshot(handEntered([...visits, spike(-15)])))).attention.map(a => a.kind)).not.toContain('unusual-charge');
  });

  it('ends the 30-day band today, not on the last recorded day', () => {
    const old = [row('o', day(-100), '-1000')];
    expect(think(inputs(snapshot(old))).spending.band.end).toBe(TODAY);
  });

  it('shows bills due soon without payslips or a forecast', () => {
    const phone = [0, 1, 2].map(n => row(`p${n}`, day(-88 + n * 30), '-4000', {description: 'Phone plan', category: 'Utilities'}));
    const due = think(inputs(snapshot(phone))).attention.find(a => a.kind === 'due-soon');
    expect(due).toMatchObject({kind: 'due-soon', minor: '4000', date: day(2)});
  });

  it('states the last 7 days as positive money out, with the rows behind each figure', () => {
    const phone = [0, 1, 2].map(n => row(`p${n}`, day(-88 + n * 30), '-4000', {description: 'Phone plan', category: 'Utilities'}));
    const brain = think(inputs(snapshot(handEntered(phone))));
    expect(brain.spending.days.map(d => d.date)).toEqual([-6, -5, -4, -3, -2, -1, 0].map(day));
    expect(brain.spending.days.slice(-2)).toEqual([{date: day(-1), outMinor: '450', evidence: ['c-1']}, {date: TODAY, outMinor: '0', evidence: []}]);
    expect(brain.spending.window).toMatchObject({start: day(-29), end: TODAY, days: 30});
    expect(brain.spending.thisMonth).toMatchObject({start: '2026-09-01', end: TODAY});
    expect(brain.spending.thisMonth.evidence).toContain('c-1');
    expect(brain.spending.busiestWeekday?.evidence.length).toBeGreaterThan(0);
    const dues = brain.attention.flatMap(a => a.kind === 'due-soon' ? a.window.dues : []);
    expect(dues.length).toBeGreaterThan(0);
    for (const d of dues) expect(d).not.toHaveProperty('height');
    expect(brain.attention.find(a => a.kind === 'due-soon')?.evidence).toEqual(expect.arrayContaining(phone.map(t => t.id)));
  });

  it('counts savings accounts toward the buffer steps', () => {
    const spendOnly = think(inputs(snapshot(handEntered()), {holdings: {spendableMinor: '50000', savedMinor: '0'}}));
    const withSavings = think(inputs(snapshot(handEntered()), {holdings: {spendableMinor: '50000', savedMinor: '900000'}}));
    const step = (b: typeof spendOnly) => b.plan.roadmap.find(r => r.id === 'buffer-1')!;
    expect(step(spendOnly).status).toBe('now');
    expect(step(withSavings).status).toBe('done');
  });

  it('pins the shared intelligence fixture', () => {
    const brain = think(inputs(fixture()));
    expect({tier: brain.tier, categories: brain.spending.categories.length, attention: brain.attention.map(a => a.kind), advice: brain.advice.map(a => a.rule)})
      .toMatchSnapshot();
  });
});

describe('the advisor summary', () => {
  it('carries no ids, account names or descriptions, and merchant names only on request', () => {
    const rows = handEntered([row('secret-id-1', day(-1), '-777', {description: 'Private Clinic Pty', rawDescription: 'PRIVATE CLINIC 998877', accountId: 'acct-private'})]);
    const s = snapshot(rows, {accountIds: ['a', 'acct-private']});
    const brain = think(inputs(s));
    const text = JSON.stringify(summary(brain)).toLowerCase();
    for (const secret of ['secret-id-1', 'acct-private', '998877', 'private clinic', 'rent0', 'landlord']) expect(text).not.toContain(secret);
    expect(JSON.stringify(summary(brain, {merchantNames: true}))).toContain('LANDLORD');
    expect(summary(brain).facts.every(f => typeof f.fact === 'string')).toBe(true);
  });
});

describe('one small-purchase line', () => {
  it('counts a purchase of exactly 15 units as small everywhere', async () => {
    const {audit} = await import('../src/intelligence/audit');
    const fifteen = Array.from({length: 6}, (_, i) => row(`f${i}`, day(-i * 4), '-1500', {kind: 'discretionary', category: 'Shopping', description: `Stall ${i}`}));
    const s = snapshot(handEntered(fifteen));
    expect(think(inputs(s)).spending.small.evidence).toEqual(expect.arrayContaining(fifteen.map(t => t.id)));
    expect(audit(s).leaks.find(l => l.kind === 'small-purchases')?.evidence).toEqual(expect.arrayContaining(fifteen.map(t => t.id)));
  });
});

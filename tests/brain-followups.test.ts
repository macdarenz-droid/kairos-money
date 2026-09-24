import {describe, expect, it} from 'vitest';
import {currency} from '../src/core/money';
import {think} from '../src/brain';
import {recurrences} from '../src/intelligence/forecast';
import type {BrainInputs} from '../src/brain/types';
import type {Snapshot, Transaction} from '../src/intelligence/model';

const AUD = currency('AUD');
const TODAY = '2026-09-18';
const day = (offset: number) => new Date(Date.parse(TODAY) + offset * 86400000).toISOString().slice(0, 10);
function row(id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction {
  return {id, accountId: 'a', date, minor, currency: AUD, description: 'Synthetic shop', category: 'Groceries',
    kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over};
}
const snapshot = (transactions: Transaction[], over: Partial<Snapshot> = {}): Snapshot => ({
  asOf: TODAY, currency: AUD, accountIds: ['a'], transactions, coverage: [], pays: [], savings: {asideMinor: '0', accountIds: [], evidence: []}, ...over});
const inputs = (s: Snapshot, over: Partial<BrainInputs> = {}): BrainInputs => ({
  snapshot: s, holdings: {spendableMinor: '500000', savedMinor: '0'}, bufferMinor: '0', debts: [], scheduled: [], cancelled: new Set(), dismissals: {}, ...over});
function base(extra: Transaction[] = []): Transaction[] {
  const rows: Transaction[] = [];
  for (let n = 0; n < 3; n++) {
    rows.push(row(`pay${n}`, day(-89 + n * 30), '300000', {kind: 'income', category: 'Salary', description: 'Employer'}));
    rows.push(row(`rent${n}`, day(-88 + n * 30), '-100000', {description: 'Landlord', category: 'Housing'}));
  }
  return [...rows, ...extra];
}

describe('(c) a cancelled subscription', () => {
  it('is not advised for cancelling again', () => {
    const stream = [0, 1, 2].map(n => row(`st${n}`, day(-75 + n * 30), '-40000', {description: 'Streamy', category: 'Entertainment', kind: 'discretionary'}));
    const s = snapshot(base(stream));
    expect(think(inputs(s)).advice.map(a => a.rule)).toContain('cancel-unused-subscription');
    const key = recurrences(s, {requireCoverage: false}).find(r => r.evidence.includes('st0'))!.merchant;
    expect(think(inputs(s, {cancelled: new Set([key])})).advice.map(a => a.rule)).not.toContain('cancel-unused-subscription');
  });
});

describe('(e) runway', () => {
  it('counts days from the first recorded day, not the first essential purchase', async () => {
    const {runwayDays} = await import('../src/brain/attention');
    const rows = [row('pay', day(-89), '300000', {kind: 'income', category: 'Salary', description: 'Employer'}), row('rent', day(-5), '-90000', {description: 'Landlord', category: 'Housing'})];
    expect(runwayDays(inputs(snapshot(rows)))).toBe(500000n / (90000n / 90n));
  });
  it('leaves out statement gaps with nothing recorded', async () => {
    const {runwayDays} = await import('../src/brain/attention');
    const rows = [row('e1', day(-89), '-30000'), row('e2', day(0), '-30000')];
    const coverage = [{accountId: 'a', start: day(-89), end: day(-60), tier: 'A' as const}, {accountId: 'a', start: day(-29), end: day(0), tier: 'A' as const}];
    expect(runwayDays(inputs(snapshot(rows, {coverage})))).toBe(500000n / (60000n / 60n));
  });
});

describe('(f) a pay rise', () => {
  it('is valued a year at the employer’s own pay cycle', () => {
    // Weekly pay: three at 1,000 then three at 1,200, so half the rise is 100 a pay and 52 pays a year.
    const pays = [0, 1, 2, 3, 4, 5].map(n => ({id: `p${n}`, employer: 'Synthetic employer', date: day(-35 + n * 7), start: day(-41 + n * 7), end: day(-35 + n * 7),
      net: n < 3 ? '100000' : '120000', gross: '150000', currency: AUD, transactionId: null}));
    const incomes = pays.map(p => row(`i${p.id}`, p.date, p.net, {kind: 'income', category: 'Salary', description: 'Synthetic employer'}));
    const advice = think(inputs(snapshot(incomes, {pays}), {dismissals: {'pay-yourself-first': {count: 2, last: TODAY}, 'build-buffer': {count: 2, last: TODAY}}})).advice;
    expect(advice.find(a => a.rule === 'save-pay-rise')?.yearlyMinor).toBe((10000n * 52n).toString());
  });
});

describe('(g) repeats', () => {
  it('group by merchant name, so card-terminal words do not split one bill in two', () => {
    const gym = ['EFTPOS SYNTHETIC GYM', 'SYNTHETIC GYM', 'VISA SYNTHETIC GYM'].map((d, n) => row(`g${n}`, day(-75 + n * 30), '-3000', {description: d, category: 'Health', kind: 'discretionary'}));
    const found = recurrences(snapshot(base(gym)), {requireCoverage: false}).find(r => r.evidence.includes('g0'));
    expect(found?.evidence).toEqual(['g0', 'g1', 'g2']);
  });
});

describe('(h) an unusual charge', () => {
  it('is still flagged when a normal visit follows it', () => {
    const visits = [-60, -50, -40, -30, -20].map((d, i) => row(`v${i}`, day(d), '-2000', {kind: 'discretionary', category: 'Eating out', description: 'Diner'}));
    const later = [row('spike', day(-3), '-30000', {kind: 'discretionary', category: 'Eating out', description: 'Diner'}), row('normal', day(-1), '-2000', {kind: 'discretionary', category: 'Eating out', description: 'Diner'})];
    expect(think(inputs(snapshot(base([...visits, ...later])))).attention.find(a => a.kind === 'unusual-charge')?.evidence).toEqual(['spike']);
  });
});

describe('(i) one small-purchase line', () => {
  it('is the same 15 units in spending patterns as in the brain', async () => {
    const {spendingPatterns} = await import('../src/intelligence/visuals/spending-patterns');
    const s = snapshot([row('fifteen', day(-2), '-1500', {kind: 'discretionary'}), row('sixteen', day(-1), '-1600', {kind: 'discretionary'})]);
    expect(spendingPatterns(s).small.ids).toEqual(['fifteen']);
    expect(think(inputs(s)).spending.small.evidence).toEqual(['fifteen']);
  });
  it('lives in one place', async () => {
    const {readFileSync} = await import('node:fs');
    for (const f of ['src/brain/shared.ts', 'src/intelligence/method.ts', 'src/intelligence/savings.ts', 'src/intelligence/audit/index.ts', 'src/intelligence/visuals/spending-patterns.ts'])
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\b(?:15|20)n\s*\*\s*10n/);
  });
});

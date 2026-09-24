import {describe, expect, expectTypeOf, it} from 'vitest';
import type {Advice, Attention, Brain, BrainSummary, DaySpend, Day, Due, Evidence, Minor, MonthFlow, Spending, SummaryFact} from '../src/brain/types';

// Keys anywhere inside T, so a forbidden field cannot hide in a nested shape.
type DeepKeys<T> = T extends readonly (infer U)[] ? DeepKeys<U>
  : T extends object ? {[K in keyof T]-?: K | DeepKeys<T[K]>}[keyof T] : never;
// An index signature (string, number or a pattern) would swallow every named key and hide the forbidden ones.
type OpenKeys<T> = DeepKeys<T> extends infer K ? K extends PropertyKey ? (Record<never, never> extends Record<K, 1> ? K : never) : never : never;
type Forbidden = 'evidence' | 'id' | 'ids' | 'accountId' | 'accountName' | 'description' | 'rawDescription' | 'name' | 'goalId' | 'debtId';
// Objects holding money but no evidence, so a figure nobody can check cannot slip in.
type Unbacked<T> = T extends readonly (infer U)[] ? Unbacked<U>
  : T extends object ? ([Extract<keyof T, 'minor' | `${string}Minor`>] extends [never] ? never : 'evidence' extends keyof T ? never : T)
    | {[K in keyof T]-?: Unbacked<T[K]>}[keyof T] : never;
const leakFigures = {monthlyMinor: '100', annualMinor: '1200'};

describe('brain contract', () => {
  it('keeps ids, account names and raw descriptions out of the advisor summary', () => {
    expectTypeOf<OpenKeys<BrainSummary>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<DeepKeys<BrainSummary>, Forbidden>>().toEqualTypeOf<never>();
    // Controls: each check must catch a leak, or it guards nothing.
    // @ts-expect-error a nested evidence key is caught
    expectTypeOf<Extract<DeepKeys<BrainSummary & {extra: {evidence: string[]}}>, Forbidden>>().toEqualTypeOf<never>();
    // @ts-expect-error an index signature is caught
    expectTypeOf<OpenKeys<BrainSummary & {extra: Readonly<Record<string, Minor>>}>>().toEqualTypeOf<never>();
  });

  it('types each attention payload by kind', () => {
    const item = {kind: 'runway', urgency: 1, days: '12', ceilingDays: '30', evidence: []} satisfies Attention;
    expectTypeOf<Extract<Attention, {kind: 'unusual-charge'}>['usualMinor']>().toEqualTypeOf<Minor>();
    // @ts-expect-error a runway item carries no merchant
    const bad: Attention = {kind: 'runway', urgency: 1, days: '1', ceilingDays: '30', evidence: [], merchant: 'x'};
    expect([item.kind, bad.kind]).toEqual(['runway', 'runway']);
  });

  it('allows only known advice rules', () => {
    // @ts-expect-error rule ids are a closed list
    const bad: Advice['rule'] = 'buy-crypto';
    expect(bad).toBe('buy-crypto');
  });

  it('types advice figures per rule, in the brain and the summary', () => {
    const good = {rule: 'build-buffer', figures: {targetMinor: '100', currentMinor: '40', keepMinor: '10'}, yearlyMinor: '0', ease: 1, evidence: []} satisfies Advice;
    // @ts-expect-error a misspelt figure key does not compile
    const typo: Advice = {rule: 'build-buffer', figures: {targetMinr: '100', currentMinor: '40', keepMinor: '10'}, yearlyMinor: '0', ease: 1, evidence: []};
    // @ts-expect-error the summary uses the same figures per rule
    const summaryTypo: BrainSummary['advice'][number] = {rule: 'save-pay-rise', figures: {increaseMinor: '100', suggestedMnor: '50'}, yearlyMinor: '0'};
    expect([good.rule, typo.rule, summaryTypo.rule]).toEqual(['build-buffer', 'build-buffer', 'save-pay-rise']);
  });

  it('holds at most 3 attention and advice items', () => {
    const item: Attention = {kind: 'runway', urgency: 1, days: '12', ceilingDays: '30', evidence: []};
    const tip: Advice = {rule: 'cut-small-purchases', figures: leakFigures, yearlyMinor: '1200', ease: 2, evidence: []};
    const three: Brain['attention'] = [item, item, item];
    // @ts-expect-error a fourth attention item does not compile
    const fourItems: Brain['attention'] = [item, item, item, item];
    // @ts-expect-error a fourth piece of advice does not compile
    const fourAdvice: Brain['advice'] = [tip, tip, tip, tip];
    // @ts-expect-error the summary keeps the same limit
    const fourSummary: BrainSummary['advice'] = [tip, tip, tip, tip];
    expect([three.length, fourItems.length, fourAdvice.length, fourSummary.length]).toEqual([3, 4, 4, 4]);
  });

  it('states per-day spending as positive money out', () => {
    expectTypeOf<keyof DaySpend>().toEqualTypeOf<'date' | 'outMinor' | 'evidence'>();
  });

  it('says which period spending covers', () => {
    expectTypeOf<Pick<Spending['window'], 'start' | 'end' | 'days'>>().toEqualTypeOf<{start: Day; end: Day; days: number}>();
    expectTypeOf<Pick<MonthFlow, 'start' | 'end'>>().toEqualTypeOf<{start: Day; end: Day}>();
  });

  it('leaves bar height to the UI', () => {
    expectTypeOf<keyof Due>().toEqualTypeOf<'date' | 'offset' | 'merchant' | 'minor' | 'beforePay'>();
  });

  it('carries evidence on every spending figure', () => {
    expectTypeOf<Unbacked<Spending>>().toEqualTypeOf<never>();
    expectTypeOf<MonthFlow['evidence']>().toEqualTypeOf<Evidence>();
  });

  it('keeps summary facts exact', () => {
    expectTypeOf<Extract<SummaryFact, {minor: unknown}>['minor']>().toEqualTypeOf<Minor>();
    // @ts-expect-error money is never a JS number
    const bad: SummaryFact = {fact: 'today.spend', minor: 12};
    expect(bad.fact).toBe('today.spend');
  });

  it('carries money as strings, never numbers', () => {
    expectTypeOf<Brain['today']['spendTodayMinor']>().toEqualTypeOf<string>();
    expectTypeOf<Brain['spending']['thisMonth']['outMinor']>().toEqualTypeOf<string>();
    expectTypeOf<Brain['plan']['split']['keepMinor']>().toEqualTypeOf<string>();
  });
});

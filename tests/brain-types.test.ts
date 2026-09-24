import {describe, expect, expectTypeOf, it} from 'vitest';
import type {Advice, Attention, Brain, BrainSummary, Minor} from '../src/brain/types';

// Keys anywhere inside T, so a forbidden field cannot hide in a nested shape.
type DeepKeys<T> = T extends readonly (infer U)[] ? DeepKeys<U>
  : T extends object ? {[K in keyof T]-?: K | DeepKeys<T[K]>}[keyof T] : never;

describe('brain contract', () => {
  it('keeps ids, account names and raw descriptions out of the advisor summary', () => {
    type Forbidden = 'evidence' | 'id' | 'ids' | 'accountId' | 'accountName' | 'description' | 'rawDescription' | 'name' | 'goalId' | 'debtId';
    expectTypeOf<Extract<DeepKeys<BrainSummary>, Forbidden>>().toEqualTypeOf<never>();
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

  it('carries money as strings, never numbers', () => {
    expectTypeOf<Brain['today']['spendTodayMinor']>().toEqualTypeOf<string>();
    expectTypeOf<Brain['spending']['thisMonth']['outMinor']>().toEqualTypeOf<string>();
    expectTypeOf<Brain['plan']['split']['keepMinor']>().toEqualTypeOf<string>();
  });
});

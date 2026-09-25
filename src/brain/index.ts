import {day, shift} from '../intelligence/model';
import {advice} from './advice';
import {attention} from './attention';
import {goals, plan as buildPlan} from './plan';
import {coveredDays, tierFor} from './shared';
import {spending} from './spending';
import {summary} from './summary';
import {today} from './today';
import type {Brain, BrainInputs, Coverage} from './types';

export {notificationPlan} from '../intelligence/notifications';
export {summary};

/** Pure and deterministic: one read of the ledger in, one Brain out. Never writes. */
export function think(input: BrainInputs): Brain {
  const s = input.snapshot;
  const full = buildPlan(input);
  const now = today(input, full.targets);
  const c = coverage(input);
  return {
    asOf: s.asOf, currency: s.currency, today: now, attention: attention(input, full), spending: spending(input),
    plan: full, goals: goals(input), advice: advice(input, full), coverage: c, tier: c.tier,
  };
}

function coverage(input: BrainInputs): Coverage {
  const s = input.snapshot;
  const firsts = [...s.transactions.map(t => t.date), ...s.coverage.map(c => c.start)].filter(d => d <= s.asOf).sort();
  const from = firsts[0] ?? null;
  const start = from && from > shift(s.asOf, -364) ? from : shift(s.asOf, -364);
  const {covered, gaps} = from ? coveredDays(s, start, s.asOf) : {covered: 0, gaps: []};
  return {tier: from ? tierFor(s, start, s.asOf) : 'insufficient', from, to: from ? s.asOf : null, coveredDays: covered,
    totalDays: from ? day(s.asOf) - day(start) + 1 : 0, gaps, unconverted: [...new Set([...s.unconverted ?? [], ...input.debtsLeftOut ?? []])].sort()};
}

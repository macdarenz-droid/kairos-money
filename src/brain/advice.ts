import {day} from '../intelligence/model';
import {upTo3} from './shared';
import type {Advice, AdviceRule, BrainInputs, LeakKind, LeakRule, Plan, UpTo3} from './types';

const LEAK_RULES: Record<LeakKind, {rule: LeakRule; ease: Advice['ease']}> = {
  subscription: {rule: 'cancel-unused-subscription', ease: 3},
  'small-purchases': {rule: 'cut-small-purchases', ease: 2},
  'bank-fees': {rule: 'avoid-bank-fees', ease: 3},
  'cash-out': {rule: 'reduce-cash-out', ease: 2},
  'lifestyle-creep': {rule: 'check-lifestyle-creep', ease: 1},
};
/** A dismissed card goes at once; a rule dismissed twice stays away. */
export const DISMISS_QUIET_DAYS = 30;
export const DISMISS_LIMIT = 2;

function hidden(input: BrainInputs, rule: AdviceRule): boolean {
  const d = input.dismissals[rule];
  if (!d) return false;
  const since = day(input.snapshot.asOf) - day(d.last);
  return d.count >= DISMISS_LIMIT || since < DISMISS_QUIET_DAYS;
}

/** Candidates from the plan, ranked by yearly impact × ease, at most three. Closed rule ids only. */
export function advice(input: BrainInputs, plan: Plan): UpTo3<Advice> {
  if (plan.status !== 'ok') return [];
  const out: Advice[] = [];
  for (const leak of plan.leaks) {
    const {rule, ease} = LEAK_RULES[leak.kind];
    out.push({rule, ease, yearlyMinor: leak.annualMinor, figures: {monthlyMinor: leak.monthlyMinor, annualMinor: leak.annualMinor}, evidence: leak.evidence});
  }
  if (plan.debt && BigInt(plan.debt.savedMinor) > 0n)
    out.push({rule: 'pay-high-interest-first', ease: 2, yearlyMinor: plan.debt.interestYearMinor,
      figures: {savedMinor: plan.debt.savedMinor, interestYearMinor: plan.debt.interestYearMinor, owedMinor: plan.debt.owedMinor}, evidence: []});
  const fixed = plan.findings.find(f => f.kind === 'fixed-costs');
  if (fixed) out.push({rule: 'lower-fixed-costs', ease: 1, yearlyMinor: fixed.annualMinor, figures: {overMinor: fixed.annualMinor}, evidence: fixed.evidence});
  const keepYear = (BigInt(plan.split.keepMinor) * 12n).toString();
  if (plan.next === 'buffer-1' || plan.next === 'buffer-3') {
    const step = plan.roadmap.find(r => r.id === plan.next)!;
    out.push({rule: 'build-buffer', ease: 2, yearlyMinor: keepYear, figures: {currentMinor: step.currentMinor, targetMinor: step.targetMinor, keepMinor: plan.split.keepMinor}, evidence: []});
  }
  if (plan.next === 'save-20') out.push({rule: 'pay-yourself-first', ease: 3, yearlyMinor: keepYear, figures: {keepMinor: plan.split.keepMinor, automateMinor: plan.split.automate.minor}, evidence: []});
  for (const rise of plan.payRise.slice(0, 1))
    out.push({rule: 'save-pay-rise', ease: 3, yearlyMinor: (BigInt(rise.suggestedMinor) * 26n).toString(), figures: {suggestedMinor: rise.suggestedMinor, increaseMinor: rise.increaseMinor}, evidence: rise.evidence});
  const score = (a: Advice) => BigInt(a.yearlyMinor) * BigInt(a.ease);
  return upTo3(out.filter(a => BigInt(a.yearlyMinor) > 0n && !hidden(input, a.rule))
    .sort((a, b) => score(b) > score(a) ? 1 : score(b) < score(a) ? -1 : a.rule.localeCompare(b.rule)));
}

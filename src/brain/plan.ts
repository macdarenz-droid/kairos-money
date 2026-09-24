import {audit} from '../intelligence/audit';
import {goalFunding, payRise, scheduledDates} from '../intelligence/forecast';
import {payModel} from './shared';
import type {BrainInputs, Goals, Plan} from './types';

/** Buffer steps count savings accounts too: money kept is a buffer even when it is not spendable. */
export function plan(input: BrainInputs): Plan {
  const s = input.snapshot;
  const held = (BigInt(input.holdings.spendableMinor) + BigInt(input.holdings.savedMinor)).toString();
  const a = audit(s, {debts: input.debts, spendableMinor: held});
  const f = a.cashFlow;
  return {
    status: a.status, window: a.window,
    split: {status: f.status, incomeSource: f.incomeSource, incomeMinor: f.incomeMinor, essentialsMinor: f.essentialsMinor, minimumsMinor: f.minimumsMinor,
      discretionaryMinor: f.discretionaryMinor, savedMinor: f.savedMinor, freeMinor: f.freeMinor, keepMinor: f.saveMinor, keepTo: f.saveTo,
      spendMinor: f.spendMinor, cutMinor: f.cutMinor, automate: f.automate},
    findings: a.findings.map(x => ({kind: x.kind, annualMinor: x.annualMinor, evidence: x.evidence})),
    leaks: a.leaks.map(l => ({kind: l.kind, monthlyMinor: l.monthlyMinor, annualMinor: l.annualMinor, count: l.count, effort: l.effort, evidence: l.evidence})),
    roadmap: a.roadmap.map(step => ({id: step.id, currentMinor: step.currentMinor, targetMinor: step.targetMinor, status: step.status, ...(step.months === undefined ? {} : {months: step.months})})),
    next: a.roadmap.find(step => step.status === 'now')?.id ?? null,
    debt: a.debt ? {...a.debt, cheaper: {...a.debt.cheaper}, other: {...a.debt.other}} : null,
    targets: a.targets,
    goalsPerPay: goals(input).items.map(g => ({goalId: g.id, perPayMinor: g.perPayMinor})),
    payRise: payRise(s).map(p => ({employer: p.employer, increaseMinor: p.increment, suggestedMinor: p.suggested, evidence: p.evidence})),
    income: a.income, evidence: a.evidence,
  };
}

export function goals(input: BrainInputs): Goals {
  const s = input.snapshot, cycles = payModel(s).cycles;
  return {bufferMinor: input.bufferMinor, items: (s.goals ?? []).map(g => {
    const due = g.targetDate || s.asOf;
    const payDates = cycles.flatMap(c => scheduledDates(c, due));
    return {id: g.id, name: g.name, kind: g.kind, targetMinor: g.targetMinor, fundedMinor: g.fundedMinor, targetDate: g.targetDate,
      perPayMinor: due >= s.asOf ? goalFunding(g.targetMinor, g.fundedMinor, due, s.asOf, payDates) : null};
  })};
}

import {upTo3} from './shared';
import type {BasisPoints, Brain, BrainSummary, Minor, SummaryFact} from './types';

/**
 * What the optional advisor may see: aggregates and rule ids. No transaction ids, account names, goal
 * names or raw descriptions; merchant names only when the owner allows it.
 */
export function summary(brain: Brain, options: {merchantNames: boolean} = {merchantNames: false}): BrainSummary {
  const facts: SummaryFact[] = [];
  const fact = (id: string, minor: Minor) => { facts.push({fact: id, minor}); return minor; };
  const dayFact = (id: string, days: string) => { facts.push({fact: id, days}); return days; };
  const shareFact = (id: string, basisPoints: BasisPoints) => { facts.push({fact: id, basisPoints}); return basisPoints; };
  const flow = (key: string, m: Brain['spending']['thisMonth']) => ({start: m.start, end: m.end,
    inMinor: fact(`${key}.in`, m.inMinor), outMinor: fact(`${key}.out`, m.outMinor), leftMinor: fact(`${key}.left`, m.leftMinor), tier: m.tier});
  const t = brain.today, sp = brain.spending, hidePlan = brain.plan.status !== 'ok';
  const result: BrainSummary = {
    asOf: brain.asOf, currency: brain.currency, tier: brain.tier,
    coverage: {coveredDays: brain.coverage.coveredDays, totalDays: brain.coverage.totalDays, gapCount: brain.coverage.gaps.length},
    today: {status: t.status, spendTodayMinor: fact('today.spend', t.spendTodayMinor), keepTodayMinor: fact('today.keep', t.keepTodayMinor),
      horizonDays: t.horizon.days, committedMinor: fact('today.committed', t.committedMinor), method: t.method.status === 'ok' ? t.method.method : null},
    attention: upTo3(brain.attention.map(a => ({kind: a.kind,
      ...('minor' in a ? {minor: fact(`attention.${a.kind}`, a.minor)} : {}),
      ...(a.kind === 'runway' ? {days: dayFact('attention.runway.days', a.days)} : {}),
      ...(a.kind === 'fixed-burden' ? {basisPoints: shareFact('attention.fixed-burden', a.basisPoints)} : {})}))),
    spending: {
      thisMonth: flow('month.this', sp.thisMonth), lastMonth: flow('month.last', sp.lastMonth),
      categories: sp.categories.map((c, i) => ({category: c.category, minor: fact(`category.${i}`, c.minor), share: c.share})),
      ...(options.merchantNames ? {merchants: sp.merchants.map((m, i) => ({merchant: m.merchant, minor: fact(`merchant.${i}`, m.minor), count: m.count}))} : {}),
      billsYearlyMinor: fact('bills.yearly', sp.bills.filter(b => !b.cancelled).reduce((n, b) => n + BigInt(b.yearlyMinor), 0n).toString()),
      billCount: sp.bills.filter(b => !b.cancelled).length,
      smallMinor: fact('small', sp.small.minor), feesMinor: fact('fees', sp.fees.minor), refundsMinor: fact('refunds', sp.refunds.minor),
    },
    plan: hidePlan ? null : {split: brain.plan.split, leaks: brain.plan.leaks.map(l => { fact(`leak.${l.kind}`, l.annualMinor); return {kind: l.kind, monthlyMinor: l.monthlyMinor, annualMinor: l.annualMinor, count: l.count, effort: l.effort}; }),
      next: brain.plan.next, debtCount: brain.plan.debt?.count ?? 0, owedMinor: brain.plan.debt?.owedMinor ?? '0'},
    goals: brain.goals.items.map(g => ({kind: g.kind, targetMinor: g.targetMinor, fundedMinor: g.fundedMinor, targetDate: g.targetDate})),
    // rule and figures come from the same item, so the assertion only restores their pairing.
    advice: upTo3(brain.advice.map(a => ({rule: a.rule, figures: a.figures, yearlyMinor: fact(`advice.${a.rule}`, a.yearlyMinor)}) as BrainSummary['advice'][number])),
    facts,
  };
  return result;
}

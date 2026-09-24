import type {Brain, BrainSummary, SummaryFact} from './types';

/**
 * What the optional advisor may see: aggregates and rule ids. No transaction ids, account names, goal
 * names or raw descriptions; merchant names only when the owner allows it.
 */
export function summary(brain: Brain, options: {merchantNames: boolean} = {merchantNames: false}): BrainSummary {
  const facts: SummaryFact[] = [];
  const fact = (id: string, value: string | number) => { facts.push({id, value}); return value; };
  const flow = (key: string, m: Brain['spending']['thisMonth']) => ({
    inMinor: String(fact(`${key}.in`, m.inMinor)), outMinor: String(fact(`${key}.out`, m.outMinor)), leftMinor: String(fact(`${key}.left`, m.leftMinor)), tier: m.tier});
  const t = brain.today, sp = brain.spending, hidePlan = brain.triage.active || brain.plan.status !== 'ok';
  const result: BrainSummary = {
    asOf: brain.asOf, currency: brain.currency, tier: brain.tier,
    coverage: {coveredDays: brain.coverage.coveredDays, totalDays: brain.coverage.totalDays, gapCount: brain.coverage.gaps.length},
    today: {status: t.status, spendTodayMinor: String(fact('today.spend', t.spendTodayMinor)), keepTodayMinor: String(fact('today.keep', t.keepTodayMinor)),
      horizonDays: t.horizon.days, committedMinor: String(fact('today.committed', t.committedMinor)), method: t.method.status === 'ok' ? t.method.method : null},
    attention: brain.attention.map(a => ({kind: a.kind,
      ...('minor' in a ? {minor: String(fact(`attention.${a.kind}`, a.minor))} : {}),
      ...(a.kind === 'runway' ? {days: String(fact('attention.runway.days', a.days))} : {}),
      ...(a.kind === 'fixed-burden' ? {basisPoints: String(fact('attention.fixed-burden', a.basisPoints))} : {})})),
    spending: {
      thisMonth: flow('month.this', sp.thisMonth), lastMonth: flow('month.last', sp.lastMonth),
      categories: sp.categories.map((c, i) => ({name: c.name, minor: String(fact(`category.${i}`, c.minor)), share: c.share})),
      ...(options.merchantNames ? {merchants: sp.merchants.map((m, i) => ({merchant: m.merchant, minor: String(fact(`merchant.${i}`, m.minor)), count: m.count}))} : {}),
      billsYearlyMinor: String(fact('bills.yearly', sp.bills.filter(b => !b.cancelled).reduce((n, b) => n + BigInt(b.yearlyMinor), 0n).toString())),
      billCount: sp.bills.filter(b => !b.cancelled).length,
      smallMinor: String(fact('small', sp.small.minor)), feesMinor: String(fact('fees', sp.fees.minor)), refundsMinor: String(fact('refunds', sp.refunds.minor)),
    },
    plan: hidePlan ? null : {split: brain.plan.split, leaks: brain.plan.leaks.map(l => { fact(`leak.${l.kind}`, l.annualMinor); return {kind: l.kind, monthlyMinor: l.monthlyMinor, annualMinor: l.annualMinor, count: l.count, effort: l.effort}; }),
      next: brain.plan.next, debtCount: brain.plan.debt?.count ?? 0, owedMinor: brain.plan.debt?.owedMinor ?? '0'},
    goals: brain.goals.items.map(g => ({kind: g.kind, targetMinor: g.targetMinor, fundedMinor: g.fundedMinor, targetDate: g.targetDate})),
    advice: brain.advice.map(a => { fact(`advice.${a.rule}`, a.yearlyMinor); return {rule: a.rule, yearlyMinor: a.yearlyMinor, figures: a.figures}; }),
    triage: brain.triage.active,
    facts,
  };
  return result;
}

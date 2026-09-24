import {abs, day, ratio, shift, sum} from '../intelligence/model';
import {dueWindow} from '../intelligence/visuals/due';
import {dueDebts} from '../intelligence/debt';
import {DUE_SOON_DAYS, FIXED_BURDEN_BP, RUNWAY_DAYS, RUNWAY_URGENT_DAYS} from '../intelligence/surfaces';
import {bills, coveredDays, payModel, spendingRows, unusualCharge, upTo3} from './shared';
import type {Attention, BrainInputs, Due, Plan, UpTo3} from './types';

/** Days the spendable balance lasts at the recent pace of essential spending, or null when unknown. */
export function runwayDays(input: BrainInputs): bigint | null {
  const s = input.snapshot, rows = spendingRows(s, shift(s.asOf, -89), s.asOf).filter(t => t.kind === 'essential');
  if (!rows.length) return null;
  // Days since the first recorded day, less statement gaps with nothing recorded in them.
  const recorded = new Set(s.transactions.filter(t => s.accountIds.includes(t.accountId)).map(t => t.date));
  const first = [...recorded, ...s.coverage.map(c => c.start)].filter(d => d <= s.asOf).sort()[0]!;
  const from = first > shift(s.asOf, -89) ? first : shift(s.asOf, -89);
  const gapDays = s.coverage.length ? coveredDays(s, from, s.asOf).gaps.reduce((n, g) => {
    for (let d = day(g.start); d <= day(g.end); d++) if (!recorded.has(shift(g.start, d - day(g.start)))) n++;
    return n;
  }, 0) : 0;
  const days = BigInt(day(s.asOf) - day(from) + 1 - gapDays);
  const perDay = sum(rows.map(t => abs(BigInt(t.minor)))) / days;
  return perDay > 0n ? BigInt(input.holdings.spendableMinor) / perDay : null;
}

/** At most three, most urgent first; ties break by kind so the same ledger gives the same screen. */
export function attention(input: BrainInputs, plan: Plan): UpTo3<Attention> {
  const s = input.snapshot, items: Attention[] = [];
  const debts = dueDebts(input.scheduled, s.asOf, DUE_SOON_DAYS);
  if (debts.length) items.push({kind: 'debt-due', urgency: 3, evidence: [], debtId: debts[0]!.id, name: debts[0]!.name, count: debts.length,
    minor: sum(debts.map(d => BigInt(d.minimumMinor))).toString(), date: debts[0]!.date});

  // Built from the repeats themselves, so "due soon" works even when a forecast cannot be made.
  const repeats = bills(s).filter(b => !input.cancelled.has(b.merchant));
  const drawn = dueWindow(repeats, s.asOf, payModel(s).next);
  const dues = drawn.dues.map((d): Due => ({date: d.date, offset: d.offset, merchant: d.merchant, minor: d.minor, beforePay: d.beforePay}));
  const window = {...drawn, dues}, soon = dues.filter(d => d.offset <= DUE_SOON_DAYS);
  const soonIds = repeats.filter(b => soon.some(d => d.merchant === b.merchant)).flatMap(b => b.evidence);
  if (soon.length) items.push({kind: 'due-soon', urgency: 3, evidence: soonIds, merchant: soon[0]!.merchant, count: soon.length,
    minor: sum(soon.map(d => BigInt(d.minor))).toString(), date: soon[0]!.date, window});

  const runway = runwayDays(input);
  if (runway !== null && runway < RUNWAY_DAYS) items.push({kind: 'runway', urgency: runway < RUNWAY_URGENT_DAYS ? 3 : 2, evidence: [],
    days: runway.toString(), ceilingDays: RUNWAY_DAYS.toString()});

  const split = plan.split, incomeMinor = BigInt(split.incomeMinor);
  if (incomeMinor > 0n) {
    const burden = ratio(BigInt(split.essentialsMinor) + BigInt(split.minimumsMinor), incomeMinor);
    if (burden >= FIXED_BURDEN_BP) items.push({kind: 'fixed-burden', urgency: 1, evidence: [], basisPoints: burden.toString()});
  }

  const odd = unusualCharge(s);
  if (odd) items.push({kind: 'unusual-charge', urgency: 2, evidence: [odd.row.id], merchant: odd.row.description.trim(),
    minor: abs(BigInt(odd.row.minor)).toString(), usualMinor: odd.usual.toString(), date: odd.row.date});

  return upTo3(items.sort((a, b) => b.urgency - a.urgency || a.kind.localeCompare(b.kind)));
}

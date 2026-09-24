import {abs, day, ratio, shift, sum} from '../intelligence/model';
import {dueWindow} from '../intelligence/visuals/due';
import {dueDebts} from '../intelligence/debt';
import {DUE_SOON_DAYS, FIXED_BURDEN_BP, RUNWAY_DAYS, RUNWAY_URGENT_DAYS} from '../intelligence/surfaces';
import {bills, payModel, spendingRows, unusualCharge} from './shared';
import type {Attention, BrainInputs, Plan} from './types';

/** Days the spendable balance lasts at the recent pace of essential spending, or null when unknown. */
export function runwayDays(input: BrainInputs): bigint | null {
  const s = input.snapshot, rows = spendingRows(s, shift(s.asOf, -89), s.asOf).filter(t => t.kind === 'essential');
  const first = rows[0]?.date;
  if (!first) return null;
  const days = BigInt(Math.min(90, day(s.asOf) - day(first) + 1));
  const perDay = sum(rows.map(t => abs(BigInt(t.minor)))) / days;
  return perDay > 0n ? BigInt(input.holdings.spendableMinor) / perDay : null;
}

/** At most three, most urgent first; ties break by kind so the same ledger gives the same screen. */
export function attention(input: BrainInputs, plan: Plan): Attention[] {
  const s = input.snapshot, items: Attention[] = [];
  const debts = dueDebts(input.scheduled, s.asOf, DUE_SOON_DAYS);
  if (debts.length) items.push({kind: 'debt-due', urgency: 3, evidence: [], debtId: debts[0]!.id, name: debts[0]!.name, count: debts.length,
    minor: sum(debts.map(d => BigInt(d.minimumMinor))).toString(), date: debts[0]!.date});

  // Built from the repeats themselves, so "due soon" works even when a forecast cannot be made.
  const window = dueWindow(bills(s).filter(b => !input.cancelled.has(b.merchant)), s.asOf, payModel(s).next);
  const soon = window.dues.filter(d => d.offset <= DUE_SOON_DAYS);
  if (soon.length) items.push({kind: 'due-soon', urgency: 3, evidence: [], merchant: soon[0]!.merchant, count: soon.length,
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

  return items.sort((a, b) => b.urgency - a.urgency || a.kind.localeCompare(b.kind)).slice(0, 3);
}

import {day} from '../intelligence/model';
import {runwayDays} from './attention';
import type {BrainInputs, Today, Triage, TriageReason} from './types';

/** Precautionary thresholds, not a diagnosis: under 5 days of runway, rising high-interest debt, repeated overdraft fees. */
export const TRIAGE_RUNWAY_DAYS = 5n;
export function triage(input: BrainInputs, today: Today): Triage {
  const s = input.snapshot, reasons: TriageReason[] = [], evidence: string[] = [];
  const runway = runwayDays(input);
  if (runway !== null && runway < TRIAGE_RUNWAY_DAYS) reasons.push('low-buffer');
  const debt = s.highInterestDebt;
  if (debt && BigInt(debt.current) > BigInt(debt.previous) && debt.evidence.length) { reasons.push('rising-high-interest-debt'); evidence.push(...debt.evidence); }
  const fees = s.transactions.filter(t => t.status === 'settled' && t.overdraftFee && day(s.asOf) - day(t.date) >= 0 && day(s.asOf) - day(t.date) < 90);
  if (fees.length >= 2) { reasons.push('repeated-overdraft-fees'); evidence.push(...fees.map(t => t.id)); }
  if (!reasons.length) return {active: false};
  return {active: true, reasons, nextEssential: today.committed[0] ?? null, availableMinor: input.holdings.spendableMinor, evidence};
}

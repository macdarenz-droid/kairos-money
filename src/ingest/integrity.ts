import { dayNumber } from './normalize';
import type { Document, Period } from './types';
export function runningBalance(doc: Document): { valid: boolean; difference: bigint } {
 if (doc.rows.length < 2 || doc.rows.some(r => r.runningBalance === undefined)) return { valid: false, difference: 0n };
 const ascending = doc.rows.every((r,i) => !i || r.date >= doc.rows[i-1]!.date);
 const descending = doc.rows.every((r,i) => !i || r.date <= doc.rows[i-1]!.date);
 const check = (rows: Document['rows']) => {
  for (let i=1;i<rows.length;i++) { const d = BigInt(rows[i-1]!.runningBalance!) + BigInt(rows[i]!.minor) - BigInt(rows[i]!.runningBalance!); if (d !== 0n) return { valid: false, difference:d }; }
  return { valid:true, difference:0n };
 };
 if (ascending) { const result = check(doc.rows); if (result.valid || !descending) return result; }
 if (descending) return check([...doc.rows].reverse());
 return { valid:false, difference:0n };
}
/**
 * WHAT THE ACCOUNT HELD BEFORE THIS STATEMENT'S FIRST ROW.
 *
 * "i was expecting if i setup 0 acct, and i import latest txn file. then i would see my balance up to
 * date on what i imported on latest date."
 *
 * An account opened at zero and then fed a statement shows the SUM OF THE MOVEMENTS, which is an honest
 * figure and the wrong one: it is what changed, not what is there. His file ends at $190.21 and the
 * movements come to -$78.27, so the account held $268.48 before the first row — and the app had every
 * part of that and never did the subtraction.
 *
 * It is derived, not guessed: one row's running balance minus that row's own amount is the balance
 * immediately before it, exactly. Returns null unless the whole running balance verifies, because a
 * column that does not chain is a column that cannot say what came before it.
 *
 * The rows may be listed oldest-first or newest-first — banks do both — so the direction is established
 * the same way the verification does rather than assumed from the dates, which repeat.
 */
export function openingBalance(doc: Document): bigint | null {
  if (!runningBalance(doc).valid) return null;
  const rows = doc.rows;
  const chains = (ordered: Document['rows']) =>
    ordered.every((r, i) => !i || BigInt(ordered[i - 1]!.runningBalance!) + BigInt(r.minor) === BigInt(r.runningBalance!));
  const oldestFirst = chains(rows) ? rows : chains([...rows].reverse()) ? [...rows].reverse() : null;
  if (!oldestFirst?.length) return null;
  const first = oldestFirst[0]!;
  return BigInt(first.runningBalance!) - BigInt(first.minor);
}

export function continuity(period: Period, existing: readonly Period[]) {
 return !existing.length ? 'first-import' : existing.some(r => dayNumber(period.start) <= dayNumber(r.end)+1 && dayNumber(period.end) >= dayNumber(r.start)-1) ? 'contiguous' : 'gap';
}
export const tierLabel = { A:'Balance-verified', B:'Running-balance-verified', C:'Continuity-checked · balance unverified' } as const;

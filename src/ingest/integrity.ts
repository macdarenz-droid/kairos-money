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
export function continuity(period: Period, existing: readonly Period[]) {
 return !existing.length ? 'first-import' : existing.some(r => dayNumber(period.start) <= dayNumber(r.end)+1 && dayNumber(period.end) >= dayNumber(r.start)-1) ? 'contiguous' : 'gap';
}
export const tierLabel = { A:'Balance-verified', B:'Running-balance-verified', C:'Continuity-checked · balance unverified' } as const;

import { isBalanceOccurrence } from '../normalize/statement-evidence';
import { runningBalance } from '../integrity';
import { dayNumber, hash, isoDay, shiftDay, similarity } from '../normalize';
import type { Document, LedgerRow, Period } from '../types';
export function coverage(ranges: readonly Period[]): Period[] {
  const result: Period[] = [];
  for (const range of [...ranges].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))) {
    isoDay(range.start); isoDay(range.end); if (range.start > range.end) throw new Error('Coverage end precedes start.');
    const last = result.at(-1);
    if (last && dayNumber(range.start) <= dayNumber(last.end) + 1) last.end = last.end > range.end ? last.end : range.end;
    else result.push({ ...range });
  }
  return result;
}
export function gaps(ranges: readonly Period[], window: Period): Period[] {
  isoDay(window.start); isoDay(window.end); if (window.start > window.end) throw new Error('Coverage window is reversed.');
  let cursor = window.start; const result: Period[] = [];
  for (const range of coverage(ranges)) {
    if (range.end < cursor || range.start > window.end) continue;
    if (range.start > cursor) result.push({ start: cursor, end: shiftDay(range.start, -1) });
    if (range.end >= window.end) return result;
    cursor = shiftDay(range.end, 1);
  }
  if (cursor <= window.end) result.push({ start: cursor, end: window.end }); return result;
}
export function coveredDays(ranges: readonly Period[]): number { return coverage(ranges).reduce((s, r) => s + dayNumber(r.end) - dayNumber(r.start) + 1, 0); }
export function dailyAverage(minor: bigint, ranges: readonly Period[]): bigint | null { const days = coveredDays(ranges); return days ? minor / BigInt(days) : null; }
export function balance(document: Document): { valid: boolean; difference: bigint } {
  if (document.integrityTier === 'C') return { valid: true, difference: 0n };
  if (document.integrityTier === 'B') return runningBalance(document);
  if (document.payslip) { const p = document.payslip; const difference = BigInt(p.gross) - BigInt(p.tax) - p.deductions.reduce((s, a) => s + BigInt(a.minor), 0n) - BigInt(p.net); return { valid: difference === 0n, difference }; }
  const unique = new Map<string, bigint>();
  for (const row of document.rows) unique.set(row.duplicateOf ?? row.fingerprint, BigInt(row.minor));
  const difference = BigInt(document.opening) + [...unique.values()].reduce((sum, value) => sum + value, 0n) - BigInt(document.closing);
  return { valid: difference === 0n, difference };
}
export function reconcile(documents: readonly Document[]): LedgerRow[] {
  const parent = new Map<string, string>();
  function root(key: string): string { let cursor = key; while (parent.has(cursor)) cursor = parent.get(cursor)!; return cursor; }
  for (const doc of documents) for (const row of doc.rows) if (row.duplicateOf) {
    const a = root(row.fingerprint), b = root(row.duplicateOf); if (a !== b) { const pendingTarget=documents.some(d=>d.rows.some(r=>r.fingerprint===row.duplicateOf && r.pending)); if(pendingTarget && !row.pending)parent.set(a,b);else parent.set(a > b ? a : b, a > b ? b : a); }
  }
  const candidatesByKey = new Map<string, { doc: Document; row: Document['rows'][number] }>();
  for (const doc of [...documents].sort((a,b)=>a.id.localeCompare(b.id))) for (const row of doc.rows) if (doc.sourceRank) candidatesByKey.set(row.fingerprint, { doc, row });
  const sourceRows = [...candidatesByKey.values()];
  const match = (a: typeof sourceRows[number], b: typeof sourceRows[number]) => a.row.fingerprint !== b.row.fingerprint && a.doc.id !== b.doc.id && a.row.accountId === b.row.accountId && a.row.currency === b.row.currency && (!a.row.occurrence || isBalanceOccurrence(a.row.occurrence)) && (!b.row.occurrence || isBalanceOccurrence(b.row.occurrence)) && Math.abs(dayNumber(a.row.date)-dayNumber(b.row.date)) <= 3 && similarity(a.row.merchant,b.row.merchant) >= 9000;
  // Corroboration requires a unique reciprocal match across source families,
  // or matching statement balance evidence. Conflicting balances stay separate.
  const corroborates = (a: typeof sourceRows[number]) => sourceRows.filter(b=>match(a,b) && a.row.pending===b.row.pending && a.row.minor===b.row.minor && (a.doc.sourceKind!==b.doc.sourceKind || ((isBalanceOccurrence(a.row.occurrence) || isBalanceOccurrence(b.row.occurrence)) && a.row.date===b.row.date && a.row.runningBalance!==undefined && a.row.runningBalance===b.row.runningBalance)) && (!(isBalanceOccurrence(a.row.occurrence) || isBalanceOccurrence(b.row.occurrence)) || a.row.runningBalance===undefined || b.row.runningBalance===undefined || a.row.runningBalance===b.row.runningBalance));
  for(const a of sourceRows) { const matches=corroborates(a); if(matches.length===1 && corroborates(matches[0]!).length===1) { const x=root(a.row.fingerprint),y=root(matches[0]!.row.fingerprint); if(x!==y) parent.set(x>y?x:y,x>y?y:x); } }
  // Match logical transactions after corroboration, so two sources for one
  // settlement do not make that settlement look ambiguous.
  const uniqueRoots = (values: typeof sourceRows) => [...new Map(values.map(v => [root(v.row.fingerprint), v])).values()];
  const pending = uniqueRoots(sourceRows.filter(v=>v.row.pending));
  const settled = sourceRows.filter(v=>!v.row.pending);
  const settlementMatches = (a: typeof sourceRows[number]) => uniqueRoots(settled.filter(b=>match(a,b) && (BigInt(a.row.minor)<0n)===(BigInt(b.row.minor)<0n)));
  const proposals = pending.map(a => ({ pending: a, matches: settlementMatches(a) }));
  for (const proposal of proposals) {
    const target = proposal.matches[0];
    if (proposal.matches.length !== 1 || !target) continue;
    const targetRoot = root(target.row.fingerprint);
    if (proposals.filter(p=>p.matches.some(v=>root(v.row.fingerprint)===targetRoot)).length !== 1) continue;
    const pendingRoot = root(proposal.pending.row.fingerprint);
    if (targetRoot !== pendingRoot) parent.set(targetRoot,pendingRoot);
  }
  const groups = new Map<string, { doc: Document; row: Document['rows'][number] }[]>();
  for (const doc of documents) for (const row of doc.rows) { const key = root(row.fingerprint); const list = groups.get(key) ?? []; list.push({ doc, row }); groups.set(key, list); }
  const ledger: LedgerRow[] = [...groups].map(([id, group]) => {
    group.sort((a, b) => Number(a.row.pending) - Number(b.row.pending) || (b.doc.sourceRank ?? 0) - (a.doc.sourceRank ?? 0) || Number(b.row.verified) - Number(a.row.verified) || b.row.confidence - a.row.confidence || a.doc.id.localeCompare(b.doc.id) || a.row.sourceId.localeCompare(b.row.sourceId));
    const chosen = group[0]!;
    return { ...chosen.row, id, owner: group.map(g => g.doc.id).sort()[0]!, transferGroup: null, sources: group.map(g => ({ batchId: g.doc.id, sourceId: g.row.sourceId })).sort((a, b) => a.batchId.localeCompare(b.batchId) || a.sourceId.localeCompare(b.sourceId)) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const candidates = (row: LedgerRow) => ledger.filter(other => row.accountId !== other.accountId && row.currency === other.currency && BigInt(row.minor) !== 0n && BigInt(row.minor) === -BigInt(other.minor) && Math.abs(dayNumber(row.date) - dayNumber(other.date)) <= 3 && /\b(?:TRANSFER|TFR|XFER|PAYMENT THANK YOU)\b/i.test(row.description + ' ' + other.description));
  for (const row of ledger) { const matches = candidates(row); if (matches.length === 1 && candidates(matches[0]!).length === 1) row.transferGroup = hash([row.id, matches[0]!.id].sort().join('|')); }
  return ledger;
}
export function nearDuplicates(row: Document['rows'][number], ledger: readonly LedgerRow[]): LedgerRow[] {
  return ledger.filter(other => other.fingerprint !== row.fingerprint && other.id !== row.duplicateOf && other.accountId === row.accountId && other.minor === row.minor && other.currency === row.currency && Math.abs(dayNumber(other.date) - dayNumber(row.date)) <= 3 && similarity(other.merchant, row.merchant) >= 9000);
}
export function totals(rows: readonly LedgerRow[], code: string): { income: bigint; spending: bigint } {
  return rows.filter(row => row.currency === code && !row.transferGroup && !row.pending).reduce((sum, row) => { const minor = BigInt(row.minor); return minor >= 0n ? { ...sum, income: sum.income + minor } : { ...sum, spending: sum.spending - minor }; }, { income: 0n, spending: 0n });
}
export function dataHealth(rows: readonly LedgerRow[], ranges: readonly Period[], window: Period, tiers: readonly ('A' | 'B' | 'C')[] = []) {
  const available = coveredDays(coverage(ranges).map(r => ({ start: r.start < window.start ? window.start : r.start, end: r.end > window.end ? window.end : r.end })).filter(r => r.start <= r.end));
  const days = coveredDays([window]); const uncategorized = rows.filter(r => !r.category).length;
  const unmatched = rows.filter(r => /\b(?:TRANSFER|TFR|XFER)\b/i.test(r.description) && !r.transferGroup).length;
  const coveragePercent = Math.floor(100 * available / days);
  const integrityConfidence = tiers.length ? Math.floor(tiers.reduce((sum,t)=>sum+(t==='A'?100:t==='B'?90:50),0)/tiers.length) : 100;
  return { integrityConfidence, coveragePercent, uncategorized, unmatchedTransfers: unmatched, score: rows.length ? Math.floor(integrityConfidence / 100 * (coveragePercent + 100 * (rows.length - uncategorized) / rows.length + 100 * (rows.length - unmatched) / rows.length) / 3) : null };
}

export function pendingCommitments(rows: readonly LedgerRow[], code: string): bigint { return rows.filter(r=>r.currency===code && r.pending && BigInt(r.minor)<0n && !r.transferGroup).reduce((sum,r)=>sum-BigInt(r.minor),0n); }

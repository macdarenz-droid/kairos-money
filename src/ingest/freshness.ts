import { dayNumber, shiftDay } from './normalize';
import type { Batch } from './types';
export function accountFreshness(accountId: string, batches: readonly Batch[], today: string) {
 const end = batches.filter(b=>b.status==='committed' && !b.payslip && b.context.accountId===accountId).map(b=>b.context.period.end).sort().at(-1) ?? null;
 const staleDays = end ? Math.max(0,dayNumber(today)-dayNumber(end)) : null;
 const start = end ? shiftDay(end,-6) : shiftDay(today,-30);
 const words = (day: string) => new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day));
 return { asOf:end, staleDays, stale:staleDays===null || staleDays>7, exportStart:start, exportEnd:today, rangeText:`${words(start)} to ${words(today)}` };
}
export function newestIsStale(accountIds: string[], batches: readonly Batch[], today: string) { return !accountIds.length || accountIds.every(id=>accountFreshness(id,batches,today).stale); }
export function importResultSentence(results: readonly {added:number;known:number;superseded:number}[]) {
 const value=results.reduce((s,r)=>({added:s.added+r.added,known:s.known+r.known,superseded:s.superseded+r.superseded}),{added:0,known:0,superseded:0});
 return `Added ${value.added} new ${value.added===1?'transaction':'transactions'}. ${value.known} ${value.known===1?'was':'were'} already known and kept once. Updated ${value.superseded} pending ${value.superseded===1?'transaction':'transactions'} to settled values.`;
}

import {covered,day,type Snapshot,type Transaction,type Window} from '../intelligence/model';
import type {AnalysisIndex,Metric,MetricFn,RecurrenceGroup} from './model';
import {combinedLedger,creditSignRules,periodCashflow,statementReconciliation,transferExclusion} from './metrics/ledger';
import {salaryPattern} from './metrics/income';
import {categoryBreakdown,merchantBreakdown} from './metrics/classify';
import {frequencyVersusSize,periodComparison,rangeAnomalies,repeatedPurchases,smallPayments} from './metrics/shape';
import {paydayEffect,regularVersusOccasional,spendingClusters,weekdayDistribution} from './metrics/timing';
import {bnplCommitments,recurrenceDetection,recurringPriceChange} from './metrics/recurrence';
import {accountBalances,cashEntries,fees,foreignExchange,refundsAndChargebacks,remittances} from './metrics/instruments';

/** Normalized merchant key: the same basis the importer uses for aliasing, lowercased and collapsed. */
const merchantKey=(t:Transaction)=>t.description.trim().toLowerCase().replace(/\s+/g,' ');

/**
 * Amount band for recurrence grouping.
 *
 * A recurring commitment rarely repeats to the cent, so grouping on the exact amount splits one
 * subscription into several. Bands are powers of ten of the absolute minor amount, which keeps the key
 * exact-integer and free of float arithmetic.
 */
function band(minor:string):string{
 let n=BigInt(minor);if(n<0n)n=-n;
 let digits=0;for(let v=n;v>=10n;v/=10n)digits++;
 return `1e${digits}`;
}

/**
 * One ordered pass over the snapshot.
 *
 * Thirty-six capabilities read these indices; none rescans the snapshot. Pending rows are separated
 * here rather than filtered per metric, so excluding them from historical figures is structural rather
 * than a rule each capability has to remember. Transfers are likewise separated, counting as neither
 * income nor spend.
 */
export function buildIndex(snapshot:Snapshot):AnalysisIndex{
 const index:AnalysisIndex={
  snapshot,historical:[],pending:[],transfers:[],
  byMonth:new Map(),byWeekday:new Map(),byMerchant:new Map(),byCategory:new Map(),byAccount:new Map(),byInstrument:new Map(),
  recurrence:[],coveredDays:new Map(),coverage:snapshot.coverage,pays:snapshot.pays,kinds:new Map(),
 };
 for(const range of snapshot.coverage){
  const days=index.coveredDays.get(range.accountId)??new Set<number>();
  for(let d=day(range.start);d<=day(range.end);d++)days.add(d);
  index.coveredDays.set(range.accountId,days);
 }
 const push=<K>(map:Map<K,Transaction[]>,key:K,t:Transaction)=>{const list=map.get(key);if(list)list.push(t);else map.set(key,[t]);};
 const groups=new Map<string,RecurrenceGroup>();
 for(const t of snapshot.transactions){
  if(t.currency!==snapshot.currency||!snapshot.accountIds.includes(t.accountId))continue;
  push(index.byAccount,t.accountId,t);
  if(t.transfer||t.kind==='transfer'){index.transfers.push(t);continue;}
  if(t.status==='pending'){index.pending.push(t);continue;}
  if(!covered(snapshot,t.date))continue;
  index.historical.push(t);
  push(index.byMonth,t.date.slice(0,7),t);
  push(index.byWeekday,new Date(t.date+'T00:00:00Z').getUTCDay(),t);
  push(index.byMerchant,merchantKey(t),t);
  push(index.byCategory,t.category,t);
  push(index.kinds,t.kind,t);
  if(t.instrument)push(index.byInstrument,t.instrument,t);
  const key=merchantKey(t)+'|'+band(t.minor);
  const group=groups.get(key);
  if(group){group.ids.push(t.id);group.dates.push(t.date);group.amounts.push(t.minor);}
  else groups.set(key,{merchant:merchantKey(t),band:band(t.minor),ids:[t.id],dates:[t.date],amounts:[t.minor]});
 }
 // Shared by the recurrence, BNPL and planning families; computed once, never recomputed.
 index.recurrence=[...groups.values()].filter(g=>g.ids.length>1);
 return index;
}

/**
 * The metric registry.
 *
 * Capabilities are added here as their families land. `analyse` is already the single entry point, so a
 * new family changes this list and nothing else.
 */
export const registry:MetricFn[]=[
 // 1-5 ledger and reconciliation
 combinedLedger,statementReconciliation,periodCashflow,transferExclusion,creditSignRules,
 // 6-8 income and classification
 salaryPattern,categoryBreakdown,merchantBreakdown,
 // 9-13 shape of spending
 repeatedPurchases,smallPayments,frequencyVersusSize,rangeAnomalies,periodComparison,
 // 14-17 costs and timing
 regularVersusOccasional,paydayEffect,weekdayDistribution,spendingClusters,
 // 18-20 recurrence
 recurrenceDetection,recurringPriceChange,bnplCommitments,
 // 21-26 instruments and adjustments
 remittances,foreignExchange,fees,refundsAndChargebacks,cashEntries,accountBalances,
];

/** Every capability's metrics for one window, in registry order. */
export function analyse(snapshot:Snapshot,window:Window):Metric[]{
 const index=buildIndex(snapshot);
 return registry.flatMap(metric=>metric(index,window));
}

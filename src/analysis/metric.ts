import {day,dates,type Transaction,type Window} from '../intelligence/model';
import type {AnalysisIndex,Metric,MetricKey} from './model';

/**
 * How many evidence ids a metric carries.
 *
 * Evidence must resolve to a real row in two taps, which a representative sample does as well as an
 * exhaustive list. An exhaustive list does not stay small: Session 3's signals cited every windowed row
 * and that alone came to about a megabyte across 24 rows once serialised, on top of the corpus copy that
 * ADR/0036 removed. The total is reported in `details.evidenceTotal` so nothing is silently lost.
 */
export const evidenceLimit=50;

/** Session 3's thresholds, reused so analysis and intelligence agree on when data is too thin. */
const minimumDays=20,minimumRatio=80;

export function windowRows(index:AnalysisIndex,window:Window):Transaction[]{
 return index.historical.filter(t=>t.date>=window.start&&t.date<=window.end);
}

/** Days in the window covered by every owned account, plus the uncovered stretches and the tier mix. */
export function coverageOf(index:AnalysisIndex,window:Window){
 const all=dates(window),ids=index.snapshot.accountIds;
 const isCovered=(date:string)=>ids.length>0&&ids.every(id=>index.coveredDays.get(id)?.has(day(date)));
 const coveredDays=all.filter(isCovered).length;
 const gaps:Window[]=[];
 for(const date of all){
  if(isCovered(date))continue;
  const last=gaps[gaps.length-1];
  if(last&&day(last.end)===day(date)-1)last.end=date;
  else gaps.push({start:date,end:date,label:'gap'});
 }
 const ranges=index.coverage.filter(c=>ids.includes(c.accountId)&&c.start<=window.end&&c.end>=window.start);
 const tierC=ranges.length>0&&ranges.filter(c=>c.tier==='C').length*2>ranges.length;
 return {coveredDays,gaps,tierC,total:all.length};
}

/**
 * A metric with the shared invariants already applied.
 *
 * A window without enough coverage returns insufficient_data and a reason rather than a zero, so a gap
 * is never reported as an absence of spending. Predominantly Tier C input reduces confidence and sets
 * `unverified`, matching Session 3.
 */
export function build(index:AnalysisIndex,window:Window,key:MetricKey,unit:string){
 const coverage=coverageOf(index,window);
 // Coverage is a count of days, not money, so it is plain integer arithmetic here exactly as
 // intelligence/signals computes its own confidence. No amount is involved and none is converted.
 const percent=coverage.total>0?Math.floor(coverage.coveredDays*100/coverage.total):0;
 const thin=coverage.coveredDays<minimumDays||percent<minimumRatio;
 const confidence=thin?0:Math.floor(percent*100/(coverage.tierC?2:1));
 const shell:Metric={
  key,version:1,period:window.label,status:'insufficient_data',value:null,unit,
  reason:thin?`At least ${minimumDays} covered days and ${minimumRatio}% window coverage are needed.`:'',
  confidence,unverified:coverage.tierC,
  coverage:{coveredDays:coverage.coveredDays,gaps:coverage.gaps,tierC:coverage.tierC},
  evidence:[],details:{},
 };
 /** Report a computed figure. Returns the insufficient_data shell untouched when coverage is too thin. */
 const ok=(value:string,details:Record<string,string>,evidence:string[]):Metric=>{
  if(thin)return shell;
  return {...shell,status:'ok',value,details:{...details,evidenceTotal:String(evidence.length)},evidence:evidence.slice(0,evidenceLimit)};
 };
 /** Report that the data is present but the figure is undefined, with its own reason. */
 const none=(reason:string):Metric=>({...shell,status:'insufficient_data',reason:thin?shell.reason:reason});
 return {shell,ok,none,thin,coverage};
}

/** Sum of minor amounts, exact. */
export const total=(rows:Transaction[])=>rows.reduce((sum,t)=>sum+BigInt(t.minor),0n);
/** Spend is negative money leaving; report it as a positive magnitude. */
export const spend=(rows:Transaction[])=>rows.filter(t=>BigInt(t.minor)<0n).reduce((sum,t)=>sum-BigInt(t.minor),0n);
export const income=(rows:Transaction[])=>rows.filter(t=>BigInt(t.minor)>0n).reduce((sum,t)=>sum+BigInt(t.minor),0n);

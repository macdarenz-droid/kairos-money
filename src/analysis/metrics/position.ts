import {dates,median,type Window} from '../../intelligence/model';
import type {AnalysisIndex,MetricFn} from '../model';
import {build,income,spend,windowRows} from '../metric';

/**
 * Daily balance reconstructed backwards from the verified position.
 *
 * The snapshot sets `liquid.verified` only after a Tier A closing balance with unbroken coverage, so this
 * walks back from a figure the user's own statement established rather than accumulating from zero. Without
 * that anchor there is no balance to report and callers say so instead of estimating one.
 */
export function trajectory(index:AnalysisIndex,window:Window):{date:string;minor:bigint}[]|null{
 const liquid=index.snapshot.liquid;
 if(!liquid||!liquid.verified)return null;
 const anchor=liquid.asOf;
 const after=(from:string)=>index.historical.filter(t=>t.date>from&&t.date<=anchor).reduce((sum,t)=>sum+BigInt(t.minor),0n);
 return dates(window).filter(date=>date<=anchor).map(date=>({date,minor:BigInt(liquid.minor)-after(date)}));
}

/** 27 — days the reconstructed balance sat at or below zero. */
export const lowBalanceEpisodes:MetricFn=(index,window)=>{
 const m=build(index,window,'low_balance_episodes','count');
 const walk=trajectory(index,window);
 if(!walk)return [m.none('No verified balance to reconstruct from: a Tier A closing balance with unbroken coverage is required.')];
 if(!walk.length)return [m.none('The window falls entirely after the verified balance date.')];
 const low=walk.filter(point=>point.minor<=0n);
 if(!low.length)return [m.ok('0',{lowestMinor:walk.reduce((a,b)=>b.minor<a.minor?b:a).minor.toString(),
  daysReconstructed:String(walk.length)},[])];
 return [m.ok(String(low.length),{firstDay:low[0]!.date,lowestMinor:low.reduce((a,b)=>b.minor<a.minor?b:a).minor.toString(),
  daysReconstructed:String(walk.length)},index.historical.filter(t=>low.some(p=>p.date===t.date)).map(t=>t.id))];
};

/** 28 — how spending is spread across the accounts the user actually uses. */
export const accountUse:MetricFn=(index,window)=>{
 const m=build(index,window,'account_use','count');
 const used=[...index.byAccount].map(([id,list])=>{
  const rows=list.filter(t=>t.date>=window.start&&t.date<=window.end&&t.status==='settled');
  return {id,count:rows.length,minor:spend(rows),ids:rows.map(t=>t.id)};
 }).filter(entry=>entry.count>0).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
 if(!used.length)return [m.none('No account records a transaction in this window.')];
 const details:Record<string,string>={accountsUsed:String(used.length),accountsOwned:String(index.snapshot.accountIds.length),busiest:used[0]!.id};
 for(const entry of used)details['account:'+entry.id]=String(entry.count);
 return [m.ok(String(used.length),details,used[0]!.ids)];
};

/**
 * 29 — what remained after the costs that are hard to avoid.
 *
 * Distinct from period cashflow: this subtracts only essential and debt spending from income, so it
 * describes room to move rather than the net of everything.
 */
export const surplus:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'surplus','minor units');
 if(!rows.length)return [m.none('No settled transactions in this window.')];
 const earned=income(rows);
 if(earned<=0n)return [m.none('No income in this window, so there is no surplus to describe.')];
 const committed=spend(rows.filter(t=>t.kind==='essential'||t.kind==='debt'));
 return [m.ok((earned-committed).toString(),{income:earned.toString(),committed:committed.toString(),
  basis:'Income less essential and debt spending. Not the net of all movement.'},
  rows.filter(t=>t.kind==='essential'||t.kind==='debt').map(t=>t.id))];
};

/** 30 — whether the reconstructed balance rose or fell across the window, and by how much. */
export const balanceTrajectory:MetricFn=(index,window)=>{
 const m=build(index,window,'balance_trajectory','minor units');
 const walk=trajectory(index,window);
 if(!walk)return [m.none('No verified balance to reconstruct from: a Tier A closing balance with unbroken coverage is required.')];
 if(walk.length<2)return [m.none('Too few reconstructed days in this window to describe a direction.')];
 const first=walk[0]!,last=walk[walk.length-1]!;
 const change=last.minor-first.minor;
 return [m.ok(change.toString(),{from:first.minor.toString(),to:last.minor.toString(),
  direction:change>0n?'higher':change<0n?'lower':'unchanged',
  typicalDayMinor:median(walk.map(p=>p.minor)).toString()},[])];
};

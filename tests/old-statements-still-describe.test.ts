import {expect,it} from 'vitest';
import {describeWindows,lastCoveredDay,windows,type Snapshot,type Transaction} from '../src/intelligence/model';
import {analyse} from '../src/analysis/index';
import {currency} from '../src/core/money';

// Someone imports three months of statements that end three months before they open the app. Every
// transaction they need is in the ledger; none of it is recent.
const AUD=currency('AUD');
const row=(i:number,date:string):Transaction=>({id:'t'+i,accountId:'a',date,minor:-1500n-BigInt(i%7)*100n,
 currency:AUD,description:'MERCHANT '+(i%5),merchant:'Merchant '+(i%5),category:'Groceries',status:'settled',
 kind:'expense',transfer:false,pending:false} as unknown as Transaction);
function ledger(lastDay:string,days:number):Snapshot{
 const dates=Array.from({length:days},(_,i)=>{const d=new Date(Date.parse(lastDay)-i*86400000);return d.toISOString().slice(0,10);});
 return {asOf:'2026-09-15',currency:AUD,accountIds:['a'],
  coverage:[{accountId:'a',start:dates[dates.length-1]!,end:lastDay}],
  pays:[],transactions:dates.map((d,i)=>row(i,d))} as unknown as Snapshot;
}

it('anchors the description window to the ledger, not to the day the app was opened',()=>{
 const snapshot=ledger('2026-06-15',95);
 expect(lastCoveredDay(snapshot)).toBe('2026-06-15');
 const [,trailing]=describeWindows(snapshot,'2026-09-15');
 expect(trailing!.end).toBe('2026-06-15');
 // The window carries the period, so a reader can always tell which months they are looking at.
 expect(trailing!.label).toContain('2026-06-15');
});

it('still describes spending from statements that stop three months before today',()=>{
 const snapshot=ledger('2026-06-15',95);
 // Anchored to today, as it was: the window holds none of the data and the app says it knows nothing.
 const fromToday=analyse(snapshot,windows('2026-09-15')[1]!);
 expect(fromToday.every(m=>m.status!=='ok')).toBe(true);

 // Anchored to the ledger: the same transactions now describe the same person.
 const fromData=analyse(snapshot,describeWindows(snapshot,'2026-09-15')[1]!);
 expect(fromData.some(m=>m.status==='ok')).toBe(true);
});

it('never reaches past today when the ledger is current', ()=>{
 // Covering up to today must not produce a window ending in the future, and must match the old behaviour.
 const snapshot=ledger('2026-09-15',95);
 const [,trailing]=describeWindows(snapshot,'2026-09-15');
 expect(trailing!.end).toBe('2026-09-15');
 expect(trailing).toEqual(windows('2026-09-15')[1]);
});

it('falls back to today when there is no coverage at all',()=>{
 const empty={asOf:'2026-09-15',currency:AUD,accountIds:['a'],coverage:[],pays:[],transactions:[]} as unknown as Snapshot;
 expect(lastCoveredDay(empty)).toBeNull();
 expect(describeWindows(empty,'2026-09-15')).toEqual(windows('2026-09-15'));
});

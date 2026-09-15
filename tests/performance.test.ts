import {expect,it} from 'vitest';
import {benchmarkLedger} from '../scripts/benchmark-ledger';
import {analyse,buildIndex} from '../src/analysis/index';
import {observe} from '../src/analysis/observations/index';
import {windows,type Snapshot,type Transaction} from '../src/intelligence/model';
import {currency} from '../src/core/money';
const AUD=currency('AUD');
it('loads 20,000 materialized ledger records with complete SQLite source provenance',async()=>{const result=await benchmarkLedger();expect(result.rows).toBe(20000);expect(result.materialized_ledger_workspace_ms).toBeLessThan(5000);console.info(JSON.stringify(result));},120000);

it('computes all 36 analysis capabilities over a 20,000-row ledger within budget',()=>{
 const asOf='2026-12-31';
 const transactions:Transaction[]=Array.from({length:20000},(_,i)=>({
  id:'row-'+String(i).padStart(5,'0'),accountId:'a',
  date:`2026-${String(1+i%12).padStart(2,'0')}-${String(1+i%28).padStart(2,'0')}`,
  minor:String(-1000-(i%500)),currency:AUD,description:'Merchant '+String.fromCharCode(97+i%26)+(i%97),
  category:(['Groceries','Eating out','Transport','Housing'] as const)[i%4]!,
  kind:(['essential','discretionary','debt','income'] as const)[i%4]!,
  status:'settled' as const,transfer:false,recurring:false,
  sources:[{file:'Synthetic.csv',row:String(i),raw:JSON.stringify({merchant:'Merchant',minor:'-1500'})}],
 }));
 const snapshot:Snapshot={asOf,currency:AUD,accountIds:['a'],
  coverage:[{accountId:'a',start:'2026-01-01',end:asOf,tier:'A'}],pays:[],transactions};
 const window=windows(asOf)[1]!;
 const started=performance.now();
 const metrics=analyse(snapshot,window);
 const analyseMs=performance.now()-started;
 const index=buildIndex(snapshot);
 const observeStart=performance.now();
 const observations=observe(index,metrics,window,{currency:AUD});
 const observeMs=performance.now()-observeStart;
 const bytes=JSON.stringify(metrics).length;
 console.info(JSON.stringify({rows:20000,analyse_ms:Math.round(analyseMs),observe_ms:Math.round(observeMs),
  metrics:metrics.length,observations:observations.length,serialised_bytes:bytes}));
 expect(metrics).toHaveLength(36);
 // One shared pre-pass rather than 36 scans; the local figure is a floor for the device, not a device claim.
 expect(analyseMs).toBeLessThan(1500);
 // Metrics cite the ledger rather than copy it. The stored signals this replaced reached 45,721,866 bytes
 // for the same ledger and cost 37,403 ms of a device screen open; see ADR/0036.
 expect(bytes).toBeLessThan(200_000);
},300000);

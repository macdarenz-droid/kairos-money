/** Generated instrumentation asset only; never included in the application APK. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {hash,normalizeRow,shiftDay} from '../src/ingest/normalize';
import {reconcile} from '../src/ingest/reconcile';
import type {Document,ImportContext} from '../src/ingest/types';
const context:ImportContext={accountId:'native-performance',accountKind:'checking',currency:'AUD',period:{start:'2026-01-01',end:'2026-12-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
const rows=Array.from({length:20000},(_,i)=>normalizeRow({sourceId:String(i),date:shiftDay('2026-01-01',i%365),description:'Synthetic performance merchant '+i.toString(16).split('').map(c=>String.fromCharCode(65+Number.parseInt(c,16))).join(''),amount:'-10.00',reference:String(i),confidence:10000},context));
const fileHash=hash('native performance file');
const document:Document={id:hash(JSON.stringify([context.accountId,fileHash])),hash:fileHash,fileName:'Synthetic performance.csv',parser:'native-performance-only',context,opening:'0',closing:'-20000000',payslip:null,rows,sourceRank:3,sourceKind:'export',integrityTier:'C'};
const ledger=reconcile([document]);
if(ledger.length!==20000||new Set(ledger.map(t=>t.id)).size!==20000||ledger.some(t=>t.sources.length!==1))throw new Error('Native fixture lost source transactions');
const directory='android/app/src/androidTest/assets/generated';
mkdirSync(directory,{recursive:true});
writeFileSync(directory+'/performance-ledger.json',JSON.stringify({document,ledger}));
console.log('Generated 20,000 distinct synthetic transactions for instrumentation only.');

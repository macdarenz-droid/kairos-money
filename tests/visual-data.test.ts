import { describe, expect, it } from 'vitest';
import { dailyCashflow, moneyFingerprint } from '../src/intelligence/visuals';
import { currency } from '../src/core/money';
import type { Signal, Snapshot } from '../src/intelligence/model';
const snapshot: Snapshot = { asOf: '2026-03-06', currency: currency('AUD'), accountIds: ['a'], pays: [], transactions: [], coverage: [{accountId:'a',start:'2026-03-01',end:'2026-03-02',tier:'C'},{accountId:'a',start:'2026-03-04',end:'2026-03-04',tier:'A'}] };
describe('Session 4 honest visual data', () => {
 it('separates zero activity, an internal gap, stale edge and future without interpolating', () => {
  const rows=dailyCashflow(snapshot,{start:'2026-03-01',end:'2026-03-07',label:'March'});
  expect(rows.map(r=>r.state)).toEqual(['covered','covered','gap','covered','stale','stale','future']);
  expect(rows.map(r=>r.net)).toEqual(['0','0',null,'0',null,null,null]);
 });
 it('keeps exact minor units and excludes pending and transfers', () => {
  const tx={id:'settled',accountId:'a',date:'2026-03-01',minor:'-9007199254740991',currency:currency('AUD'),description:'Purchase',category:'Food',kind:'essential' as const,status:'settled' as const,transfer:false,recurring:false};
  const rows=dailyCashflow({...snapshot,transactions:[tx,{...tx,id:'pending',status:'pending'},{...tx,id:'transfer',transfer:true}]},{start:'2026-03-01',end:'2026-03-01',label:'Day'});
  expect(rows[0]?.net).toBe('-9007199254740991');expect(rows[0]?.evidence).toEqual(['settled']);
 });
 it('never invents a fingerprint axis or accepts a partially covered month as final', () => {
  expect(moneyFingerprint([], '2026-03').axes.every(a=>a.radius===null)).toBe(true);
  const signals = ['spend_volatility','impulse_ratio','payday_decay','category_concentration','buffer_days'].map(key=>({key,version:1,period:'2026-03',status:'ok',value:'5000',unit:'basis points',reason:'',confidence:1,unverified:true,inputs:{window:{start:'2026-03-01',end:'2026-03-31',label:'March'},coveredDays:31,transactions:[],coverage:[],pays:[],liquid:null,selfReport:null},evidence:['b','a'],details:{}} as Signal));
  const full=moneyFingerprint(signals,'2026-03');expect(full.provisional).toBe(false);expect(full.unverified).toBe(true);
  expect(moneyFingerprint([...signals].reverse(),'2026-03')).toEqual(full);
  expect(moneyFingerprint(signals.map(s=>({...s,inputs:{...s.inputs,coveredDays:30}})),'2026-03').provisional).toBe(true);
 });
});

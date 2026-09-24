import {describe,it,expect} from 'vitest';
import {currency} from '../src/core/money';
import {defaultNotices,notificationPlan} from '../src/intelligence/notifications';
import type {Snapshot,Transaction} from '../src/intelligence/model';
const aud=currency('AUD');
function transaction(id:string,date:string,minor='-1000'):Transaction{return {id,accountId:'a',date,minor,currency:aud,description:'Shop',category:'Shopping',kind:'discretionary',status:'settled',transfer:false,recurring:false};}
function snapshot():Snapshot{return {asOf:'2026-09-14',currency:aud,accountIds:['a'],transactions:[],coverage:[{accountId:'a',start:'2026-08-01',end:'2026-09-14',tier:'C'}],pays:[]};}
describe('Opt-in imported-data notices',()=>{
 it('defaults off, and today\'s coverage no longer gates opt-in notices',()=>{const s=snapshot();expect(notificationPlan(s,defaultNotices)).toEqual([]);s.coverage[0]!.end='2026-09-13';expect(notificationPlan(s,{bill:true,unusual:true,price:true,digest:true}).map(n=>n.kind)).toEqual(['digest']);});
 it('requires a complete previous month for a digest, including every account',()=>{const s=snapshot();expect(notificationPlan(s,{...defaultNotices,digest:true})).toHaveLength(1);s.accountIds.push('b');expect(notificationPlan(s,{...defaultNotices,digest:true})).toEqual([]);});
 it('derives transaction review from a baseline and excludes pending and transfers',()=>{const s=snapshot();s.transactions=Array.from({length:20},(_,i)=>transaction(String(i),'2026-09-13'));s.transactions.push(transaction('large','2026-09-14','-4000'));const p={...defaultNotices,unusual:true};const result=notificationPlan(s,p);expect(result).toHaveLength(1);expect(result[0]!.key).toMatch(/^[a-f0-9]{64}$/);s.transactions.at(-1)!.status='pending';expect(notificationPlan(s,p)).toEqual([]);s.transactions.at(-1)!.status='settled';s.transactions.at(-1)!.transfer=true;expect(notificationPlan(s,p)).toEqual([]);});
 it('requires repeated comparable payments before calling a price change',()=>{const s=snapshot();s.transactions=['2026-08-24','2026-08-31','2026-09-07','2026-09-14'].map((date,i)=>transaction(String(i),date,i===3?'-1100':'-1000'));const p={...defaultNotices,price:true};expect(notificationPlan(s,p)).toHaveLength(1);s.transactions.at(-1)!.minor='-1049';expect(notificationPlan(s,p)).toEqual([]);s.transactions.at(-1)!.minor='-1100';s.transactions[1]!.minor='-2000';expect(notificationPlan(s,p)).toEqual([]);});
});

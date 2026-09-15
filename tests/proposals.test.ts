import {expect,it,describe} from 'vitest';
import {bulkCategoryProposals,preferredCategories,repeatEntryProposals} from '../src/ui/proposals/derive';
import {preferenceKeys,preferenceRepository} from '../src/ledger/preferences';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import type {LedgerRow} from '../src/ingest/types';
import type {ManualEntry} from '../src/ledger/manual';

const row=(over:Partial<LedgerRow>&{id:string}):LedgerRow=>({
 sourceId:over.id,date:'2026-03-01',minor:'-1500',currency:'AUD',description:'WOOLWORTHS 123',merchant:'Woolworths',
 category:null,confidence:10000,issues:[],duplicateOf:null,occurrence:'',createRule:false,pending:false,verified:false,
 fingerprint:over.id.padStart(64,'0'),mcc:null,accountId:'a',reference:'',
 owner:'source',transferGroup:null,sources:[],...over} as LedgerRow);

describe('bulk category proposals',()=>{
 it('offers only a category the user already used for that merchant',()=>{
  const rows=[row({id:'k1',category:'Groceries'}),row({id:'u1'}),row({id:'u2'}),row({id:'u3'})];
  const [proposal]=bulkCategoryProposals(rows);
  expect(proposal!.prefill.category).toBe('Groceries');
  expect(proposal!.prefill.ids).toEqual(['u1','u2','u3']);
  expect(proposal!.evidence).toEqual(['u1','u2','u3']);
  expect(proposal!.detail).toContain('already filed');
 });

 it('invents nothing when the merchant has never been categorised',()=>{
  expect(bulkCategoryProposals([row({id:'u1'}),row({id:'u2'}),row({id:'u3'})])).toEqual([]);
 });

 it('stays quiet below a group worth a tap',()=>{
  expect(bulkCategoryProposals([row({id:'k',category:'Groceries'}),row({id:'u1'}),row({id:'u2'})])).toEqual([]);
 });

 it('never proposes a category for a matched transfer',()=>{
  const rows=[row({id:'k',category:'Groceries'}),row({id:'t1',transferGroup:'g'}),row({id:'t2',transferGroup:'g'}),row({id:'t3',transferGroup:'g'})];
  expect(bulkCategoryProposals(rows)).toEqual([]);
 });

 it('groups a merchant the way the analysis index does, regardless of casing or spacing',()=>{
  const rows=[row({id:'k',merchant:'  WOOLWORTHS  ',category:'Groceries'}),row({id:'u1',merchant:'woolworths'}),
   row({id:'u2',merchant:'Woolworths'}),row({id:'u3',merchant:'WOOLWORTHS'})];
  expect(bulkCategoryProposals(rows)[0]!.prefill.ids).toHaveLength(3);
 });

 it('refuses a category the repository would reject',()=>{
  const rows=[row({id:'k',category:'Not a real category'}),row({id:'u1'}),row({id:'u2'}),row({id:'u3'})];
  expect(bulkCategoryProposals(rows)).toEqual([]);
 });
});

describe('repeat entry proposals',()=>{
 const entry=(over:Partial<ManualEntry>&{id:string}):ManualEntry=>({
  kind:'expense',accountId:'a',destinationId:null,date:'2026-03-01',minor:'1500',description:'Cafe Mika',
  category:'Eating out',notes:'',links:{},...over});

 it('prefills from the user’s own entry and dates it today, committing nothing',()=>{
  const [proposal]=repeatEntryProposals([entry({id:'e1'})],'2026-03-20');
  expect(proposal!.prefill).toEqual({kind:'expense',accountId:'a',minor:'1500',description:'Cafe Mika',category:'Eating out',date:'2026-03-20'});
  expect(proposal!.source).toBe('manual_history');
  expect(proposal!.evidence).toEqual(['e1']);
 });

 it('does not repeat a transfer, which needs its destination chosen deliberately',()=>{
  expect(repeatEntryProposals([entry({id:'t',kind:'transfer',destinationId:'b'})],'2026-03-20')).toEqual([]);
 });

 it('offers distinct entries, newest first, and stays bounded',()=>{
  const entries=[entry({id:'a1',date:'2026-03-01'}),entry({id:'a2',date:'2026-03-05'}),
   entry({id:'b1',description:'Bus',minor:'500',date:'2026-03-06'}),entry({id:'c1',description:'Rent',minor:'90000',date:'2026-03-07'}),
   entry({id:'d1',description:'Gym',minor:'4000',date:'2026-03-08'})];
  const proposals=repeatEntryProposals(entries,'2026-03-20');
  expect(proposals).toHaveLength(3);
  expect(proposals.map(p=>p.label)).toEqual(['Gym','Rent','Bus']);
 });

 it('ranks the categories the user actually uses',()=>{
  const entries=[entry({id:'1',category:'Groceries'}),entry({id:'2',category:'Groceries'}),entry({id:'3',category:'Transport'}),entry({id:'4',category:null})];
  expect(preferredCategories(entries)).toEqual(['Groceries','Transport']);
 });
});

describe('the preference store',()=>{
 it('remembers a choice, and stores nothing outside its closed key set',async()=>{
  const {driver,raw}=memoryDriver();
  try{
   await migrate(driver);
   const preferences=preferenceRepository(driver);
   expect(await preferences.read('preferred-account')).toBeNull();
   await preferences.write('preferred-account','account-1');
   expect(await preferences.read('preferred-account')).toBe('account-1');
   await preferences.clear('preferred-account');
   expect(await preferences.read('preferred-account')).toBeNull();
   await expect(preferences.write('unknown' as 'preferred-account','x')).rejects.toThrow('Unknown preference.');
   // Pinned to the exact list on purpose: adding a preference has to be a deliberate act that updates this
   // line, so the store cannot quietly become general-purpose storage. Still an exact match, not a subset.
   expect(preferenceKeys).toEqual(['preferred-account','preferred-original-currency']);
   await preferences.write('preferred-original-currency','USD');
   expect(await preferences.read('preferred-original-currency')).toBe('USD');
   await preferences.clear('preferred-original-currency');
  }finally{raw.close();}
 });

 it('touches no ledger data',async()=>{
  const {driver,raw}=memoryDriver();
  try{
   await migrate(driver);
   raw.exec("INSERT INTO accounts(id,name,institution,type,currency,opening_balance_minor) VALUES('a','Synthetic','S','checking','AUD',0)");
   const before=await driver.query('SELECT * FROM accounts');
   await preferenceRepository(driver).write('preferred-account','a');
   expect(await driver.query('SELECT * FROM accounts')).toEqual(before);
   expect(await driver.query('SELECT * FROM transactions')).toEqual([]);
  }finally{raw.close();}
 });
});

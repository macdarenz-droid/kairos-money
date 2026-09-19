import {expect,it} from 'vitest';
import type {Snapshot,Transaction} from '../src/intelligence/model';
import {spendingPatterns} from '../src/intelligence/visuals/spending-patterns';
const tx=(id:string,date:string,minor='-1000',rest:Partial<Transaction>={}):Transaction=>({id,accountId:'a',date,minor,currency:'AUD',description:'PURCHASE SYNTHETIC CAFE',rawDescription:'Debit Card Purchase Synthetic Cafe',category:'Uncategorised',kind:'unknown',status:'settled',transfer:false,recurring:false,...rest});
const snapshot=():Snapshot=>({asOf:'2026-09-14',currency:'AUD',accountIds:['a','b'],coverage:[{accountId:'a',start:'2026-01-01',end:'2026-05-31',tier:'A'},{accountId:'b',start:'2026-02-01',end:'2026-07-31',tier:'A'}],pays:[],transactions:[]});
it('shows old, uncategorised statement purchases despite unequal account coverage and no payslips',()=>{
 const s=snapshot();s.transactions=[tx('jan','2026-01-15'),tx('jul','2026-07-02','-2000',{accountId:'b'}),tx('pending','2026-07-03','-9000',{accountId:'b',status:'pending'})];
 const p=spendingPatterns(s);expect(p.total).toBe('3000');expect(p.pending).toBe(1);expect(p.merchants[0]).toMatchObject({count:2,minor:'3000'});expect(p.monthly.map(m=>m.complete)).toEqual([false,false]);
 expect(spendingPatterns(s,'2026-07','b')).toMatchObject({total:'2000',small:{minor:'2000'}});expect(spendingPatterns(s,'2026-07','b').monthly[0]!.complete).toBe(true);
});
it('separates unmatched transfers, cash, ambiguous debits and credits instead of inventing consumption or income',()=>{
 const s=snapshot();s.transactions=[tx('buy','2026-02-02'),tx('move','2026-02-03','-5000',{rawDescription:'Transfer To Self'}),tx('cash','2026-02-03','-10000',{rawDescription:'ATM withdrawal'}),tx('unknown','2026-02-03','-3000',{rawDescription:'Unclear reference'}),tx('salary','2026-02-03','20000',{rawDescription:'Deposit Salary'}),tx('refund','2026-02-03','1000'),tx('matched','2026-02-03','-4000',{transfer:true}),tx('future','2026-10-01'),tx('other-currency','2026-02-01','-500',{currency:'USD'})];
 const p=spendingPatterns(s);expect(p).toMatchObject({total:'1000',otherDebits:'18000',credits:'21000',debits:'23000'});expect(p.transfers.map(t=>t.id)).toEqual(['matched']);expect(p.small.ids).toEqual(['buy']);expect(p.monthly[0]!.ids).toEqual(['buy']);
});
it('keeps exact amounts and source ids for repeated payments and excludes an unselected account',()=>{
 const s=snapshot();s.transactions=[tx('one','2026-02-02'),tx('two','2026-02-02'),tx('other','2026-02-03','-3000',{accountId:'b'})];const p=spendingPatterns(s,'all','a');
 expect(p.merchants[0]).toMatchObject({count:2,minor:'2000',ids:['one','two']});expect(p.weekdays.find(d=>d.name==='Monday')).toMatchObject({minor:'2000',count:2});expect(p.small.ids).toEqual(['one','two']);expect(spendingPatterns(s,'2026-09').rows).toEqual([]);
});

it('separates repayment services and groups bank location suffix variants without altering sources',()=>{const s=snapshot();s.transactions=[tx('loan','2026-02-02','-1500',{description:'PURCHASE AFTERPAY AUS',rawDescription:'Debit Card Purchase Afterpay Aus'}),tx('one','2026-02-02','-1000',{description:'PURCHASE SYNTHETIC CAFE ROCKBANK AUS'}),tx('two','2026-02-03','-2000',{description:'SYNTHETIC CAFE ROCKBANK VI AUS CARD XX1234 VALUE DATE'})];const p=spendingPatterns(s);expect(p.total).toBe('3000');expect(p.repayments).toEqual({minor:'1500',ids:['loan']});expect(p.otherDebits).toBe('1500');expect(p.merchants).toHaveLength(1);expect(s.transactions[2]!.description).toContain('CARD XX1234');});

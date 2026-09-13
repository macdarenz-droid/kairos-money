import { describe, expect, it } from 'vitest';
import { commBankStatement, isCommBankStatement } from '../src/ingest/parse/commbank';
import { statementDetails } from '../src/ingest/parse/statement-details';
import { normalizeRow } from '../src/ingest/normalize';
import { documentFromExtracted } from '../src/ingest/sources/FileSource';
import type { TextItem } from '../src/ingest/parse/positional';
import type { ImportContext } from '../src/ingest/types';
export const context: ImportContext={accountId:'synthetic',accountKind:'checking',currency:'AUD',period:{start:'2025-12-01',end:'2026-01-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
export function fixture():TextItem[]{
 const items:TextItem[]=[];const add=(page:number,y:number,x:number,text:string,width=40)=>items.push({page,y,x,text,width});
 add(1,20,60,'CommBank Smart Access');
 for(const page of [1,2]) ['Date','Transaction','Debit','Credit','Balance'].forEach((text,i)=>add(page,100,[60,90,360,410,500][i]!,text,[24,60,28,32,40][i]!));
 add(1,120,60,'01 Dec 2025 OPENING BALANCE');add(1,120,500,'100.00 CR');
 add(1,140,60,'31 Dec Synthetic cafe');add(1,150,90,'Card xx0000');add(1,160,90,'Value Date 30/12/2025');add(1,160,360,'10.00',28);add(1,160,500,'90.00',25);add(1,160,527,'CR',13);
 add(1,159,20,'Synthetic rotated margin identifier');
 add(2,120,60,'01 Jan Synthetic income');add(2,135,90,'Salary');add(2,135,410,'20.00',32);add(2,135,500,'110.00 CR');
 add(2,150,60,'02 Jan Synthetic cafe');add(2,160,360,'10.00',28);add(2,160,500,'100.00 CR');
 add(2,180,60,'31 Jan 2026 CLOSING BALANCE');add(2,180,500,'100.00 CR');add(2,200,60,'Important information');return items;
}
describe('CommBank named-date statement',()=>{
 it('reads wrapped amounts, split CR suffixes, repeated headers and year rollover',()=>{
  expect(isCommBankStatement(fixture())).toBe(true);
  const rows=commBankStatement(fixture(),context).map(r=>normalizeRow(r,context));
  expect(rows.map(r=>r.date)).toEqual(['2025-12-31','2026-01-01','2026-01-02']);
  expect(rows.map(r=>r.minor)).toEqual(['-1000','2000','-1000']);
  expect(rows.map(r=>r.runningBalance)).toEqual(['9000','11000','10000']);
  expect(rows[0]!.description).not.toContain('margin');
 });
 it('rejects a missing debit instead of returning a partial statement',()=>{
  expect(()=>commBankStatement(fixture().filter(i=>!(i.page===1&&i.text==='10.00')),context)).toThrow('missing or conflicting');
 });
 it('detects explicit metadata including debit balances without guessing dates',()=>{
  expect(statementDetails('CommBank Statement\nPeriod 1 Dec 2025 - 31 Jan 2026\nClosing Balance 100.00 CR\n01 Dec 2025 OPENING BALANCE 25.00 DR')).toEqual({start:'2025-12-01',end:'2026-01-31',opening:'-25.00',closing:'100.00'});
  expect(statementDetails('CommBank Period 31 Feb 2026 - 31 Mar 2026 Opening Balance 1.00 CR Closing Balance 1.00 CR')).toBeNull();
  expect(statementDetails('CommBank Period 1 Dec 2025 - 31 Jan 2026')).toBeNull();
 });
 it('uses the production registry and balance-chain transaction identity',()=>{
  const doc=documentFromExtracted({kind:'pdf',text:'Synthetic CommBank',items:fixture(),table:null,ocr:false,issuer:null},'synthetic-hash','synthetic.pdf',context,'100.00','100.00',false);
  expect(doc.parser).toBe('commbank-statement-v1');expect(doc.rows).toHaveLength(3);
  expect(doc.rows.every(r=>r.occurrence.startsWith('statement-balance:'))).toBe(true);
 });
});

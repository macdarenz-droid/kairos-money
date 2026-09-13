import { describe, expect, it } from 'vitest';
import { isWestpacStatement, westpacStatement } from '../src/ingest/parse/westpac';
import { statementDetails } from '../src/ingest/parse/statement-details';
import { normalizeAmount, normalizeRow } from '../src/ingest/normalize';
import type { TextItem } from '../src/ingest/parse/positional';
import type { ImportContext } from '../src/ingest/types';
function fixture(): TextItem[] {
  const items: TextItem[] = [];
  const put = (page: number, y: number, x: number, text: string, width = 80) => items.push({ page, y, x, text, width });
  for (const page of [1,2]) {
    put(page, 30, 460, 'Westpac Choice');
    ['DATE','TRANSACTION DESCRIPTION','DEBIT','CREDIT','BALANCE'].forEach((text,i) => put(page, 100, [67,115,369,445,503][i]!, text, [21,115,24,30,39][i]!));
  }
  put(1,120,67,'01/02/25'); put(1,120,115,'STATEMENT OPENING BALANCE'); put(1,120,512,'100.00',30);
  put(1,140,67,'02/02/25'); put(1,140,115,'Debit Card Purchase Synthetic');
  put(1,155,115,'Cafe'); put(1,155,368,'10.00',25); put(1,155,517,'90.00',25);
  put(1,790,62,'Westpac Banking Corporation ABN Synthetic footer');
  put(2,120,67,'03/02/25'); put(2,120,115,'Deposit Synthetic');
  put(2,135,115,'Employer'); put(2,135,450,'30.00',25); put(2,135,512,'120.00',30);
  put(2,150,67,'04/02/25'); put(2,150,115,'Synthetic groceries'); put(2,150,368,'20.00',25); put(2,150,512,'100.00',30);
  put(2,170,67,'28/02/25'); put(2,170,115,'CLOSING BALANCE'); put(2,170,512,'100.00',30);
  put(2,195,62,'Further information and product terms');
  return items;
}
const context: ImportContext = { accountId:'synthetic', accountKind:'checking', currency:'AUD', period:{start:'2025-02-01',end:'2025-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false };
describe('Westpac Choice statement layout', () => {
  it('joins wrapped descriptions with final-line amounts across repeated page headers', () => {
    const items=fixture(); expect(isWestpacStatement(items)).toBe(true);
    const raw=westpacStatement(items), rows=raw.map(row=>normalizeRow(row,context));
    expect(rows.map(row=>row.minor)).toEqual(['-1000','3000','-2000']);
    expect(raw[0]!.description).toBe('Debit Card Purchase Synthetic Cafe');
    expect(raw[1]!.description).toBe('Deposit Synthetic Employer');
    expect(rows.map(row=>row.date)).toEqual(['2025-02-02','2025-02-03','2025-02-04']);
    let balance=10000n; for(const row of raw){balance+=(row.direction==='debit'?-1n:1n)*normalizeAmount(row.amount,'AUD','.');expect(balance).toBe(normalizeAmount(row.runningBalance!,'AUD','.'));}
    expect(balance).toBe(10000n);
  });
  it('rejects a missing amount instead of returning partial transactions', () => {
    expect(()=>westpacStatement(fixture().filter(item=>!(item.page===1&&item.text==='10.00')))).toThrow('incomplete or conflicting');
  });
  it('does not claim other PDF layouts', () => { expect(isWestpacStatement(fixture().filter(item=>item.text!=='Westpac Choice'))).toBe(false); });
  it('prefills only explicit valid statement dates and balances', () => {
    expect(statementDetails('Statement Period\n1 February 2025 - 28 February 2025\nWestpac Choice\nOpening Balance + $1,100.00\nClosing Balance - $25.00')).toEqual({start:'2025-02-01',end:'2025-02-28',opening:'1100.00',closing:'-25.00'});
    expect(statementDetails('Westpac Choice Statement Period 31 February 2025 - 28 March 2025 Opening Balance + $1.00 Closing Balance + $1.00')).toBeNull();
    expect(statementDetails('Westpac Choice 1 February 2025 - 28 February 2025')).toBeNull();
  });
});

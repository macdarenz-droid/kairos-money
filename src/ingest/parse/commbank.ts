import { ImportFailure, type ImportContext, type RawRow } from '../types';
import { normalizeDate } from '../normalize';
import { textLines, type TextItem } from './positional';
const labels = ['Date', 'Transaction', 'Debit', 'Credit', 'Balance'];
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const headerLine = (items: readonly TextItem[]) => labels.every(label => items.some(i => i.text.toLowerCase() === label.toLowerCase()));
export function isCommBankStatement(items: readonly TextItem[]): boolean {
  return items.some(i => /CommBank|Commonwealth\s*Bank/i.test(i.text)) && textLines(items).some(l => headerLine(l.items));
}
export function commBankStatement(items: readonly TextItem[], context: ImportContext): RawRow[] {
  const rows: RawRow[] = []; let header: TextItem[] | undefined, page = 0, active = false;
  let current: { date: string; description: string[]; amounts: string[]; page: number } | undefined;
  function flush() {
    if (!current) return;
    const [debit='',credit='',balance=''] = current.amounts;
    if (!current.description.length || !!debit === !!credit || !balance) throw new ImportFailure('CommBank transaction columns were read.', `A transaction on page ${current.page} has missing or conflicting amounts.`, current.date, 'Choose the complete statement. No partial import was created.');
    rows.push({sourceId:String(rows.length+1),date:current.date,description:current.description.join(' '),amount:debit||credit,direction:debit?'debit':'credit',runningBalance:balance,confidence:9800}); current=undefined;
  }
  for (const line of textLines(items)) {
    if (line.page !== page) { page=line.page; active=false; }
    if (headerLine(line.items)) { header=labels.map(label=>line.items.find(i=>i.text.toLowerCase()===label.toLowerCase())!);active=true;continue; }
    if (!active || !header) continue;
    const cells=line.items.filter(i=>i.x>=header![0]!.x-5);
    if (!cells.length) continue;
    const first=cells[0]!;
    const match=first.x<header[1]!.x && /^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?\s+(.+)$/.exec(first.text);
    if (match) {
      flush();
      if (/^(?:OPENING|CLOSING) BALANCE$/i.test(match[4]!)) { if (/CLOSING/i.test(match[4]!)) active=false;continue; }
      const month=months.indexOf(match[2]!.toLowerCase())+1;
      if (!month) throw new ImportFailure('CommBank dates were located.','A month could not be read.',match[2]!,'Check the source date.');
      current={date:normalizeDate(`${match[1]}/${month}${match[3]?'/'+match[3]:''}`,context.period,'DMY'),description:[match[4]!],amounts:['','',''],page};
    }
    if (!current) continue;
    for (const cell of cells) {
      if (match && cell===first) continue;
      if (cell.x<header[2]!.x-35) { current.description.push(cell.text);continue; }
      if (!/^(?:[\d,]+\.\d{2}(?:\s*(?:CR|DR))?|CR|DR)$/i.test(cell.text)) throw new ImportFailure('CommBank amount columns were located.','A value in an amount column could not be read.',cell.text,'Check this statement row.');
      const right=cell.x+cell.width;
      const index=[0,1,2].sort((a,b)=>Math.abs(right-(header![a+2]!.x+header![a+2]!.width))-Math.abs(right-(header![b+2]!.x+header![b+2]!.width)))[0]!;
      if (/^(CR|DR)$/i.test(cell.text) && current.amounts[index] && !/(CR|DR)$/i.test(current.amounts[index]!)) current.amounts[index]=`${current.amounts[index]} ${cell.text}`;
      else if (current.amounts[index]) throw new ImportFailure('CommBank row was read.','Two amounts occupy one column.',current.date,'Check the complete source row.');
      else current.amounts[index]=cell.text;
    }
  }
  flush();
  if (!rows.length) throw new ImportFailure('CommBank statement was identified.','No complete transactions were found.','','Choose a statement with transaction pages.');
  return rows;
}

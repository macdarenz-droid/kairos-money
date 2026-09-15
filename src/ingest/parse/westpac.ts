import { ImportFailure, type RawRow } from '../types';
import { textLines, type TextItem } from './positional';
const labels = ['DATE', 'TRANSACTION DESCRIPTION', 'DEBIT', 'CREDIT', 'BALANCE'];
export function isWestpacStatement(items: readonly TextItem[]): boolean {
  return items.some(item => /Westpac\s+Choice/i.test(item.text)) && textLines(items).some(line => labels.every(label => line.items.some(item => item.text.toUpperCase() === label)));
}
export function westpacStatement(items: readonly TextItem[]): RawRow[] {
  const rows: RawRow[] = []; let header: TextItem[] | undefined; let active = false;
  let current: { date: string; description: string[]; amounts: string[]; page: number } | undefined;
  function flush() {
    if (!current) return;
    const description = current.description.join(' ').trim();
    if (/^(?:STATEMENT )?(?:OPENING|CLOSING) BALANCE$/i.test(description)) { current = undefined; return; }
    const [debit = '', credit = '', balance = ''] = current.amounts;
    if (!description || (!!debit === !!credit) || !balance) throw new ImportFailure('The Westpac transaction columns were identified.', `A transaction on page ${current.page} has incomplete or conflicting amounts.`, `${current.date} ${description}`, 'Check that the complete statement was selected. No partial import was created.');
    rows.push({ sourceId: String(rows.length + 1), date: current.date, description, amount: debit || credit, direction: debit ? 'debit' : 'credit', runningBalance: balance, confidence: 9800 });
    current = undefined;
  }
  for (const line of textLines(items)) {
    if (labels.every(label => line.items.some(item => item.text.toUpperCase() === label))) { header = labels.map(label => line.items.find(item => item.text.toUpperCase() === label)!); active = true; continue; }
    const text = line.items.map(item => item.text).join(' ');
    if (/^Westpac Banking Corporation\b/i.test(text)) { active = false; continue; }
    if (!active || !header) continue;
    const date = line.items.find(item => item.x < header![1]!.x - 8 && /^\d{2}\/\d{2}\/\d{2,4}$/.test(item.text));
    if (date) { flush(); current = { date: date.text, description: [], amounts: ['', '', ''], page: line.page }; }
    if (!current) throw new ImportFailure('The Westpac table header was read.', 'A transaction continuation has no preceding date.', text, 'Select the complete statement, including its first transaction page.');
    for (const item of line.items) {
      if (item === date) continue;
      if (item.x < header[2]!.x - 45) { current.description.push(item.text); continue; }
      if (!/^[+-]?\s*\$?[\d,]+\.\d{2}(?:\s*(?:DR|CR|-))?$/i.test(item.text)) throw new ImportFailure('The Westpac amount columns were identified.', 'An amount could not be read.', item.text, 'Check the original statement amount before importing.');
      const right = item.x + item.width;
      const index = [0, 1, 2].sort((a, b) => Math.abs(right - (header![a + 2]!.x + header![a + 2]!.width)) - Math.abs(right - (header![b + 2]!.x + header![b + 2]!.width)))[0]!;
      if (current.amounts[index]) throw new ImportFailure('The Westpac row was read.', 'Two values occupy the same amount column.', text, 'Check this row in the original PDF.');
      current.amounts[index] = item.text;
    }
    if (/^(?:STATEMENT )?CLOSING BALANCE$/i.test(current.description.join(' '))) { flush(); active = false; }
  }
  flush();
  if (!rows.length) throw new ImportFailure('Westpac statement headers were read.', 'No transaction rows were found.', '', 'Choose a statement that includes transaction pages.');
  return rows;
}

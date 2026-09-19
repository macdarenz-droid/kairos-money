import { ImportFailure, type RawRow } from '../types';
export type Columns = { date: number; description: number; amount: number | null; debit: number | null; credit: number | null; reference: number | null; balance?: number | null };
export function csvRows(text: string, delimiter?: string): string[][] {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
  const separator = delimiter ?? [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0]!;
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === '"') { if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else if (quoted) { quoted = false; closed = true; } else if (!cell && !closed) quoted = true; else throw new Error('A CSV quote is misplaced. Export this file as a standard quoted CSV.'); }
    else if (!quoted && (c === separator || c === '\n' || c === '\r')) {
      row.push(cell.trim()); cell = ''; closed = false;
      if (c !== separator) { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && input[i + 1] === '\n') i++; }
    } else { if (closed && c.trim()) throw new Error('Unexpected text follows a CSV quote. Check the CSV delimiter.'); cell += c; }
  }
  if (quoted) throw new Error('A CSV quoted field is unfinished. Export the complete file again.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
/**
 * Column names, in order of preference rather than as one alternation.
 *
 * A single pattern has to match exactly one column or it gives up, which is right for "is this a header"
 * but wrong when a bank prints BOTH "Transaction Date" and "Posting Date". Ordered patterns settle that:
 * the first pattern matching exactly one column wins, so naming more synonyms can only ever read more
 * statements, never make an already-readable one ambiguous.
 */
const NAMES = {
  date: [/^(?:posted date|posting date|date posted|process(?:ed)? date)$/, /^(?:transaction date|date of transaction|txn date|tran date)$/, /^(?:value date|effective date)$/, /^date$/],
  description: [/^(?:description|transaction description)$/, /^(?:details|transaction details|narrative|particulars|memo)$/, /^(?:merchant|payee|paid to|name)$/, /^(?:transaction|activity)$/],
  amount: [/^(?:amount|transaction amount)$/, /^amount\s*\(?[a-z]{3}\)?$/, /^(?:value|amt)$/],
  debit: [/^(?:debit|debits|debit amount)$/, /^(?:withdrawal|withdrawals|withdrawal amount)$/, /^(?:money out|paid out|out)$/, /^dr$/],
  credit: [/^(?:credit|credits|credit amount)$/, /^(?:deposit|deposits|deposit amount)$/, /^(?:money in|paid in|in)$/, /^cr$/],
  balance: [/^(?:balance|running balance|balance after|closing balance)$/, /^balance\s*\(?[a-z]{3}\)?$/],
  reference: [/^(?:reference|reference id|transaction id|fitid|receipt)$/],
} as const;

export function inferColumns(header: readonly string[]): Columns {
  const cells = header.map(h => h.trim().toLowerCase());
  const find = (patterns: readonly RegExp[]) => {
    for (const pattern of patterns) {
      const found = cells.map((h, i) => pattern.test(h) ? i : -1).filter(i => i >= 0);
      if (found.length === 1) return found[0]!;
    }
    return null;
  };
  const date = find(NAMES.date), description = find(NAMES.description);
  const amount = find(NAMES.amount), debit = find(NAMES.debit), credit = find(NAMES.credit);
  if (date === null || description === null || (amount === null && (debit === null || credit === null))) throw new ImportFailure('The table and its column labels were read.', 'Date, description or amount columns are unclear.', header.join(' | '), 'Map the date, description and amount (or debit and credit) columns.');
  return { date, description, amount, debit, credit, reference: find(NAMES.reference), balance: find(NAMES.balance) };
}
export function parseTable(table: readonly string[][], mapping?: Columns, confidence = 9800): RawRow[] {
  const header = table[0]; if (!header) throw new ImportFailure('The file opened.', 'No table rows were found.', '', 'Choose a statement containing transactions.');
  const columns = mapping ?? inferColumns(header);
  const active = Object.values(columns).filter((v): v is number => v !== null);
  if (active.some(i => !Number.isInteger(i) || i < 0 || i >= header.length) || new Set(active).size !== active.length || (columns.amount === null && (columns.debit === null || columns.credit === null))) throw new ImportFailure('The raw table was read.', 'Column mapping is incomplete or assigns a column twice.', header.join(' | '), 'Assign distinct date, description and amount columns, or both debit and credit columns.');
  return table.slice(1).filter(row => row.some(Boolean) && row.join('|') !== header.join('|')).map((row, i) => {
    if (row.length !== header.length) throw new ImportFailure('A table header was found.', `Row ${i + 2} has ${row.length} cells; expected ${header.length}.`, row.join(' | '), 'Confirm the delimiter or export the statement again.');
    const debit = columns.debit === null ? '' : row[columns.debit] ?? '', credit = columns.credit === null ? '' : row[columns.credit] ?? '';
    if (columns.amount === null && !debit.trim() && !credit.trim()) throw new ImportFailure('Debit and credit columns were identified.', `Row ${i + 2} has no amount.`, row.join(' | '), 'Correct the missing amount or map the signed amount column.');
    const nonzero = (v: string) => v.trim() !== '' && !/^[0., ]+$/.test(v);
    if (columns.amount === null && nonzero(debit) && nonzero(credit)) throw new ImportFailure('Debit and credit columns were identified.', `Row ${i + 2} contains both a debit and a credit.`, row.join(' | '), 'Correct the row or map a signed amount column.');
    const mccIndex = header.findIndex(h => /^(?:mcc|merchant category code)$/i.test(h.trim()));
    const mcc = mccIndex >= 0 && /^\d{4}$/.test(row[mccIndex] ?? '') ? row[mccIndex] : undefined;
    const amount = columns.amount === null ? (nonzero(debit) ? debit : credit || debit || '0') : row[columns.amount] ?? '';
    const balance = columns.balance === null || columns.balance === undefined ? '' : (row[columns.balance] ?? '').trim();
    return { ...(mcc ? { mcc } : {}), ...(balance ? { runningBalance: balance } : {}), sourceId: String(i + 2), date: row[columns.date] ?? '', description: row[columns.description] ?? '', amount, ...(columns.amount === null ? { direction: nonzero(debit) ? 'debit' as const : 'credit' as const } : {}), ...(columns.reference === null ? {} : { reference: row[columns.reference] ?? '' }), confidence };
  });
}

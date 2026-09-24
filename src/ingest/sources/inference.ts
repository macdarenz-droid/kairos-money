import { dateSpan, hash, normalizeAmount, normalizeDate } from '../normalize';
import type { ImportContext, RawRow } from '../types';
import { ImportFailure, PeriodTooNarrow, type Period } from '../types';
import type { ColumnRole, ExportMapping } from './types';
const labels: Record<ColumnRole, RegExp> = {
 date: /^(date|posted date|posting date|transaction date)$/i,
 description: /^(description|details|merchant|narrative|particulars|transaction description)$/i,
 amount: /^(amount|transaction amount|value)$/i,
 debit: /^(debit|debit amount|withdrawal|withdrawals|money out)$/i,
 credit: /^(credit|credit amount|deposit|deposits|money in)$/i,
 balance: /^(balance|running balance|account balance)$/i,
 reference: /^(reference|reference id|transaction id|fitid)$/i,
 status: /^(status|transaction status)$/i,
};
export class MappingRequired extends ImportFailure {
 constructor(public table: string[][], public proposal: ExportMapping, public reasons: string[]) {
  super('The export rows were read.', reasons.join(' '), table.slice(0, 4).map(r => r.join(' | ')).join('\n'), 'Assign the columns and date format below, then confirm the mapping.');
 }
}
export function inferExport(table: string[][], context: ImportContext, saved?: ExportMapping) {
 if (!table.length || !table[0]?.length) throw new Error('The export has no rows.');
 const width = table[0].length;
 if (table.some(r => r.length !== width)) throw new Error('Export rows have different column counts. Check the delimiter or export again.');
 const header = table[0].some(c => Object.values(labels).some(pattern => pattern.test(c.trim())));
 const signature = hash(JSON.stringify([width, header ? table[0].map(c => c.trim().toLowerCase()) : 'headerless']));
 if (saved && saved.signature === signature) {
  validateMapping(saved, width);
  // A remembered mapping settles the columns, not the dates: rows outside the period are still named.
  const values = table.slice(saved.header ? 1 : 0).map(r => r[saved.columns.date!] ?? '');
  const fits = values.every(v => { try { normalizeDate(v, context.period, saved.dateOrder); return true; } catch { return false; } });
  return { mapping: saved, confidence: 10000, reasons: [], outside: fits ? null : dateSpan(values, context.period, saved.dateOrder) };
 }
 const columns: ExportMapping['columns'] = {};
 if (header) for (const [role, pattern] of Object.entries(labels)) { const found = table[0].flatMap((v, i) => pattern.test(v.trim()) ? [i] : []); if (found.length === 1) columns[role as ColumnRole] = found[0]!; }
 const rows = table.slice(header ? 1 : 0);
 if (!rows.length) throw new Error('The export contains headings but no transactions.');
 const reasons: string[] = [];
 let outside: Period | null = null;
 const candidates = (test: (v: string) => boolean) => Array.from({ length: width }, (_, i) => i).filter(i => rows.every(r => test(r[i] ?? '')));
 const dates = candidates(v => /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[/.-]\d{1,2}(?:[/.-](?:\d{2}|\d{4}))?$/.test(v));
 if (columns.date === undefined && dates.length === 1) columns.date = dates[0]!;
 const numeric = candidates(v => { try { normalizeAmount(v, context.currency, context.decimal); return true; } catch { return false; } });
 if (columns.amount === undefined && columns.debit === undefined && columns.credit === undefined) {
  const signed = numeric.filter(i => rows.some(r => /^[-+]|DR$|CR$|^\(/i.test(r[i]!)));
  if (signed.length === 1) columns.amount = signed[0]!;
  else if (numeric.length === 1) columns.amount = numeric[0]!;
 }
 if (columns.description === undefined) {
  const descriptions = candidates(v => /[a-z]/i.test(v) && !/^(pending|processing|authorised|authorized|settled|posted|completed)$/i.test(v) && !/^(AUD|USD|PHP)$/i.test(v));
  if (descriptions.length === 1) columns.description = descriptions[0]!;
 }
 if (columns.status === undefined) { const status = candidates(v => /^(pending|processing|authorised|authorized|settled|posted|completed)$/i.test(v)); if (status.length === 1) columns.status = status[0]!; }
 // An extra numeric column can be a balance or a reference. Never guess its meaning.
 if (!header && numeric.some(i => i !== columns.amount)) reasons.push('Another numeric column may be a balance or reference.');
 let dateOrder = context.dateOrder;
 if (columns.date !== undefined) {
  const valid = (order: 'DMY' | 'MDY') => rows.every(r => { try { normalizeDate(r[columns.date!]!, context.period, order); return true; } catch { return false; } });
  const dmy = valid('DMY'), mdy = valid('MDY');
  if (dmy !== mdy) dateOrder = dmy ? 'DMY' : 'MDY';
  else if (!dmy) {
   // "Dates do not match the supplied export range" sent people to the column mapping and the date
   // format, when what was wrong was the statement period — and this is the case that actually happens,
   // because an export covers whatever range you asked the bank for and the period is typed separately.
   // Reading the column's own span says which dates to enter, once, for every row at the same time.
   outside = dateSpan(rows.map(r => r[columns.date!] ?? ''), context.period, 'DMY')
     ?? dateSpan(rows.map(r => r[columns.date!] ?? ''), context.period, 'MDY');
   reasons.push(outside
     ? `This file covers ${outside.start} to ${outside.end}, which the statement period does not include.`
     : 'Dates do not match the supplied export range.');
 }
  else if (rows.some(r => !/^\d{4}-/.test(r[columns.date!]!) && r[columns.date!]!.split(/[/.-]/)[0] !== r[columns.date!]!.split(/[/.-]/)[1])) reasons.push('Day/month and month/day are both possible.');
 }
 const mapping = { columns, header, dateOrder, signature };
 try { validateMapping(mapping, width); } catch { reasons.push('Date, description and amount columns need confirmation.'); }
 return { mapping, confidence: reasons.length ? 5000 : 9800, reasons, outside };
}
export function validateMapping(mapping: ExportMapping, width: number) {
 const c = mapping.columns, used = Object.values(c);
 if (c.date === undefined || c.description === undefined || (c.amount === undefined && (c.debit === undefined || c.credit === undefined)) || (c.amount !== undefined && (c.debit !== undefined || c.credit !== undefined)) || used.some(i => !Number.isInteger(i) || i < 0 || i >= width) || new Set(used).size !== used.length) throw new Error('Assign distinct date, description and amount columns, or debit and credit columns.');
}
export function parseExport(table: string[][], context: ImportContext, saved?: ExportMapping) {
 const inferred = inferExport(table, context, saved);
 // A period that leaves rows out is its own problem with its own fix, and asking somebody to reassign
 // columns they never got wrong is how an import becomes unreachable.
 if (inferred.outside) throw new PeriodTooNarrow(inferred.outside, context.period);
 if (inferred.confidence < 9000) throw new MappingRequired(table, inferred.mapping, inferred.reasons);
 const m = inferred.mapping, c = m.columns; validateMapping(m, table[0]!.length);
 const rows: RawRow[] = table.slice(m.header ? 1 : 0).map((r, i) => {
  const debit = c.debit === undefined ? '' : r[c.debit]!, credit = c.credit === undefined ? '' : r[c.credit]!;
  const nonzero = (v: string) => v !== '' && normalizeAmount(v, context.currency, context.decimal) !== 0n;
  if (c.amount === undefined && ((!debit && !credit) || (nonzero(debit) && nonzero(credit)))) throw new Error(`Row ${i + 1} needs one debit or credit amount.`);
  const status=c.status===undefined?'':r[c.status]!.trim();
  if(status && !/^(pending|processing|authorised|authorized|settled|posted|completed)$/i.test(status))throw new Error(`Row ${i+1} has an unknown transaction status. Confirm it before importing.`);
  return { sourceId: String(i + (m.header ? 2 : 1)), date: r[c.date!]!, description: r[c.description!]!, amount: c.amount === undefined ? (nonzero(debit) ? debit : credit || debit) : r[c.amount]!, ...(c.amount === undefined ? { direction: nonzero(debit) ? 'debit' as const : 'credit' as const } : {}), ...(c.reference === undefined ? {} : { reference: r[c.reference]! }), pending: /^(pending|processing|authorised|authorized)$/i.test(status), ...(c.balance === undefined ? {} : { runningBalance: r[c.balance]! }), confidence: 9800 };
 });
 return { rows, mapping: m };
}
// Issuer fingerprints select adapters only; columns are always inferred from the file.
export function issuerAdapter(institution: string): 'commbank-netbank' | 'westpac-online' | 'generic-export' {
 return /commbank|commonwealth|netbank/i.test(institution) ? 'commbank-netbank' : /westpac/i.test(institution) ? 'westpac-online' : 'generic-export';
}
export function parseCommBankExport(table: string[][], context: ImportContext, mapping?: ExportMapping) { return { ...parseExport(table,context,mapping), issuer: 'commbank-netbank' as const }; }
export function parseWestpacExport(table: string[][], context: ImportContext, mapping?: ExportMapping) { return { ...parseExport(table,context,mapping), issuer: 'westpac-online' as const }; }

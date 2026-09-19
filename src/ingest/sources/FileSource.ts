import { distinguishStatementRows } from '../normalize/statement-evidence';
import { accountTail, looksLikePayslip, statementDetails } from '../parse/statement-details';
import { extract, type Extracted } from '../extract';
import { dateSpan, hash, normalizeAmount, normalizeRow } from '../normalize';
import { parse } from '../parse';
import type { Columns } from '../parse/csv';
import { parsePayslip } from '../parse/payslip';
import type { Document, ImportContext, Period } from '../types';
import type { SourceOptions, TransactionSource } from './types';
import { inferExport, issuerAdapter, parseCommBankExport, parseWestpacExport, parseExport } from './inference';
export type { Columns } from '../parse/csv';
export function documentFromExtracted(extracted: Extracted, sourceHash: string, fileName: string, context: ImportContext, opening: string, closing: string, payslip: boolean, mapping?: Columns, aliases: readonly { canonical: string; aliases: string[] }[] = []): Document {
 const parsed = payslip ? { rows: [], parser: 'labelled-payslip-v1' } : parse(extracted, context, mapping);
 const doc: Document = { id: hash(JSON.stringify([context.accountId, sourceHash])), hash: sourceHash, fileName, parser: parsed.parser, rawRows: parsed.rows, sourceText: extracted.text.slice(0,12000), context, opening: normalizeAmount(opening, context.currency, context.decimal).toString(), closing: normalizeAmount(closing, context.currency, context.decimal).toString(), rows: parsed.rows.map(r => normalizeRow(r, context, aliases)), payslip: payslip ? parsePayslip(extracted.text, context) : null };
 // The balance chain is the evidence that two identical lines are two purchases, whichever layout
 // printed them. It used to be consulted only for two named layouts, so a report read by the general
 // table reader — every row right, every balance right — still had its repeated purchases folded into
 // one and was quarantined for the exact sum of them. The chain itself is the guard: where it does not
 // hold, nothing is marked.
 return distinguishStatementRows(doc);
}

/** What a file says about itself, read before anyone is asked anything. */
export type Inspection = {
 start: string; end: string; opening: string; closing: string;
 /** Where the dates came from: printed on a layout whose wording is known, worked out from the rows, or not found. */
 read: 'statement' | 'rows' | 'none';
 /** The file carries the labelled fields a payslip has. */
 payslip: boolean;
 /** The last four digits of an account number the file names, or null when it names none. */
 accountTail: string | null;
};

/**
 * The first and last transaction date in the file, read against a window wide enough for any file a
 * person would import now. A date that could be more than one day inside that window (a two-digit
 * year with no century, a day and month with no year) gives up rather than guess, and the person is
 * asked instead — the one case where they still are.
 */
function rowSpan(e: Extracted, order: 'DMY' | 'MDY'): Period | null {
 const year = new Date().getUTCFullYear();
 const wide: Period = { start: `${year - 3}-01-01`, end: `${year + 1}-12-31` };
 const context: ImportContext = { accountId: '', accountKind: 'checking', currency: 'AUD', period: wide, dateOrder: order, decimal: '.', creditPositivePurchases: false };
 let dates: string[];
 try {
  if (e.table) {
   const { mapping } = inferExport(e.table, context);
   if (mapping.columns.date === undefined) return null;
   dates = e.table.slice(mapping.header ? 1 : 0).map(r => r[mapping.columns.date!] ?? '');
  } else dates = parse(e, context).rows.map(r => r.date);
 } catch { return null; }
 return dateSpan(dates, wide, order) ?? dateSpan(dates, wide, order === 'DMY' ? 'MDY' : 'DMY');
}
/** A payslip's window is its own three dates: the pay date and the period it pays for. */
function payslipSpan(text: string, order: 'DMY' | 'MDY'): Period | null {
 const field = (names: string) => new RegExp(`^(?:${names})\\s*[:|]\\s*(.+)$`, 'im').exec(text)?.[1]?.trim();
 const dates = [field('Pay date|Payment date'), field('Period start|Pay period start'), field('Period end|Pay period end')].filter((v): v is string => !!v);
 if (!dates.length) return null;
 const year = new Date().getUTCFullYear(), wide: Period = { start: `${year - 3}-01-01`, end: `${year + 1}-12-31` };
 return dateSpan(dates, wide, order) ?? dateSpan(dates, wide, order === 'DMY' ? 'MDY' : 'DMY');
}
export class FileSource implements TransactionSource {
 private extracted?: Promise<Extracted>;
 readonly identity: string;
 readonly capabilities = { dateBounded: true, balanceAuthoritative: false, pendingAware: true };
 constructor(private bytes: Uint8Array, private name: string, private institution = '') { this.identity = hash(bytes); }
 private read(progress?: (message: string) => void): Promise<Extracted> {
  this.extracted ??= extract(this.bytes, this.name, progress);
  return this.extracted;
 }
 /**
  * Everything the confirm sheet used to ask for, read off the file instead. "when i import something,
  * i dont want to fill up any dates, opening or closing. The app should do that for me."
  *
  * Stated balances are taken only from layouts whose wording is known; they are what the import is
  * checked against, and a wrong guess would quarantine every row. Dates need no such caution: the rows
  * carry them, and their span IS the period the file covers.
  */
 async inspect(progress?: (message: string) => void, dateOrder: 'DMY' | 'MDY' = 'DMY'): Promise<Inspection> {
  const e = await this.read(progress);
  const payslip = looksLikePayslip(e.text), tail = accountTail(e.text);
  const stated = statementDetails(e.text);
  if (stated) return { ...stated, read: 'statement', payslip, accountTail: tail };
  const span = payslip ? payslipSpan(e.text, dateOrder) : rowSpan(e, dateOrder);
  return { start: span?.start ?? '', end: span?.end ?? '', opening: '', closing: '', read: span ? 'rows' : 'none', payslip, accountTail: tail };
 }
 async receiptText(progress?: (message:string)=>void) {const data=await this.read(progress);if(data.kind!=='pdf'&&data.kind!=='image')throw new Error('Choose a receipt photo or PDF.');return data.text;}
 async fetch(options: SourceOptions, progress?: (message: string) => void, institution = this.institution): Promise<Document> {
  const e = await this.read(progress);
  if(e.kind==='ofx' && /<STMTTRNP[>\s]/i.test(e.text))throw new Error('This OFX includes pending records in a separate table. Export CSV including status so every row can be reviewed.');
  const { context, opening, closing, payslip, aliases = [] } = options;
  const sourceRank = e.kind === 'ofx' || e.kind === 'qif' ? 4 : e.table ? 3 : e.ocr ? 1 : 2;
  // Explicit stated balances retain the Session 2 statement path, including statement tables.
  const statement = payslip || (opening.trim() !== '' && closing.trim() !== '');
  if ((opening.trim() === '') !== (closing.trim() === '')) throw new Error('Provide both stated balances, or leave both blank for a transaction export.');
  if (statement || !e.table) {
   const doc = documentFromExtracted(e, this.identity, this.name, context, statement ? opening || '0' : '0', statement ? closing || '0' : '0', payslip, undefined, aliases);
   if (statement) return { ...doc, sourceRank, sourceKind: 'statement', integrityTier: 'A' };
   // A PDF or a photo with no stated balances is what a transaction export is: rows, checked against
   // each other. Every row carrying a running balance makes the chain verifiable (tier B); without one
   // there is continuity to check and nothing more (tier C), and the tier says so. It used to be refused
   // until two figures were copied off the page — the page the app had just read.
   return { ...doc, sourceRank, sourceKind: 'export', integrityTier: doc.rows.every(r => r.runningBalance !== undefined) && doc.rows.length > 1 ? 'B' : 'C' };
  }
  const issuer = issuerAdapter(institution);
  const parser = issuer === 'commbank-netbank' ? parseCommBankExport : issuer === 'westpac-online' ? parseWestpacExport : parseExport;
  const parsed = parser(e.table, context, options.mapping), resolved = { ...context, dateOrder: parsed.mapping.dateOrder };
  return { id: hash(JSON.stringify([context.accountId, this.identity])), hash: this.identity, fileName: this.name, parser: issuer + '-v2', context: resolved, opening: '0', closing: '0', payslip: null, rawRows: parsed.rows, rows: parsed.rows.map(r => { const row=normalizeRow(r, resolved, aliases); row.issues=row.issues.filter(i=>!i.startsWith('This transaction is pending.')); return row; }), sourceRank, sourceKind: 'export', integrityTier: parsed.rows.every(r => r.runningBalance !== undefined) && parsed.rows.length > 1 ? 'B' : 'C' };
 }
}

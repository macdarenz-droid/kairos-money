import { distinguishStatementRows } from '../normalize/statement-evidence';
import { statementDetails } from '../parse/statement-details';
import { extract, type Extracted } from '../extract';
import { hash, normalizeAmount, normalizeRow } from '../normalize';
import { parse } from '../parse';
import type { Columns } from '../parse/csv';
import { parsePayslip } from '../parse/payslip';
import type { Document, ImportContext } from '../types';
import type { SourceOptions, TransactionSource } from './types';
import { issuerAdapter, parseCommBankExport, parseWestpacExport, parseExport } from './inference';
export type { Columns } from '../parse/csv';
export function documentFromExtracted(extracted: Extracted, sourceHash: string, fileName: string, context: ImportContext, opening: string, closing: string, payslip: boolean, mapping?: Columns, aliases: readonly { canonical: string; aliases: string[] }[] = []): Document {
 const parsed = payslip ? { rows: [], parser: 'labelled-payslip-v1' } : parse(extracted, context, mapping);
 const doc: Document = { id: hash(JSON.stringify([context.accountId, sourceHash])), hash: sourceHash, fileName, parser: parsed.parser, rawRows: parsed.rows, sourceText: extracted.text.slice(0,12000), context, opening: normalizeAmount(opening, context.currency, context.decimal).toString(), closing: normalizeAmount(closing, context.currency, context.decimal).toString(), rows: parsed.rows.map(r => normalizeRow(r, context, aliases)), payslip: payslip ? parsePayslip(extracted.text, context) : null };
 return ['westpac-choice-v1', 'commbank-statement-v1'].includes(parsed.parser) ? distinguishStatementRows(doc) : doc;
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
 async inspect(progress?: (message: string) => void) { return statementDetails((await this.read(progress)).text); }
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
   if (!statement && (e.kind === 'pdf' || e.kind === 'image')) throw new Error('Copy the statement’s stated opening and closing balances before reviewing this PDF.');
   return { ...doc, sourceRank, sourceKind: statement ? 'statement' : 'export', integrityTier: statement ? 'A' : 'C' };
  }
  const issuer = issuerAdapter(institution);
  const parser = issuer === 'commbank-netbank' ? parseCommBankExport : issuer === 'westpac-online' ? parseWestpacExport : parseExport;
  const parsed = parser(e.table, context, options.mapping), resolved = { ...context, dateOrder: parsed.mapping.dateOrder };
  return { id: hash(JSON.stringify([context.accountId, this.identity])), hash: this.identity, fileName: this.name, parser: issuer + '-v2', context: resolved, opening: '0', closing: '0', payslip: null, rawRows: parsed.rows, rows: parsed.rows.map(r => { const row=normalizeRow(r, resolved, aliases); row.issues=row.issues.filter(i=>!i.startsWith('This transaction is pending.')); return row; }), sourceRank, sourceKind: 'export', integrityTier: parsed.rows.every(r => r.runningBalance !== undefined) && parsed.rows.length > 1 ? 'B' : 'C' };
 }
}

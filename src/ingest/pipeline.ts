import type { Extracted } from './extract';
import { hash, normalizeAmount, normalizeRow } from './normalize';
import { parse } from './parse';
import type { Columns } from './parse/csv';
import { parsePayslip } from './parse/payslip';
import type { Document, ImportContext } from './types';
export function buildDocument(extracted: Extracted, sourceHash: string, fileName: string, context: ImportContext, opening: string, closing: string, payslip: boolean, mapping?: Columns): Document {
  const parsed = payslip ? { rows: [], parser: 'labelled-payslip-v1' } : parse(extracted, context, mapping);
  return { id: hash(JSON.stringify([context.accountId, sourceHash])), hash: sourceHash, fileName, parser: parsed.parser, rawRows: parsed.rows, sourceText: extracted.text.slice(0, 12000), context, opening: normalizeAmount(opening, context.currency, context.decimal).toString(), closing: normalizeAmount(closing, context.currency, context.decimal).toString(), rows: parsed.rows.map(r => normalizeRow(r, context)), payslip: payslip ? parsePayslip(extracted.text, context) : null };
}
export async function prepare(bytes: Uint8Array, fileName: string, context: ImportContext, opening: string, closing: string, payslip: boolean, progress: (message: string) => void) {
  const { extract } = await import('./extract');
  const extracted = await extract(bytes, fileName, progress); return buildDocument(extracted, hash(bytes), fileName, context, opening, closing, payslip);
}

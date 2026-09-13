import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizeRow } from '../src/ingest/normalize';
import { csvRows, parseTable } from '../src/ingest/parse/csv';
import { positionalTable, textLines, type TextItem } from '../src/ingest/parse/positional';
import { parsePayslip } from '../src/ingest/parse/payslip';
import type { ImportContext } from '../src/ingest/types';
GlobalWorkerOptions.workerSrc = resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
const context: ImportContext = { accountId: 'synthetic', accountKind: 'checking', currency: 'AUD', period: { start: '2026-01-01', end: '2026-01-31' }, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: true };
async function extractFixture(name: string) {
  const task = getDocument({ data: new Uint8Array(readFileSync(resolve('fixtures/ingest', name + '.pdf'))), isEvalSupported: false, useSystemFonts: true });
  try { const pdf = await task.promise; const items: TextItem[] = []; for (let number = 1; number <= pdf.numPages; number++) { const page = await pdf.getPage(number); const content = await page.getTextContent(); for (const item of content.items) if ('str' in item && item.str.trim()) items.push({ text: item.str.trim(), x: item.transform[4] as number, y: page.getViewport({ scale: 1 }).height - (item.transform[5] as number), width: item.width, page: number }); } return { items, pages: pdf.numPages }; } finally { await task.destroy(); }
}
describe('Actual synthetic golden files', () => {
  for (const kind of ['checking', 'savings', 'credit'] as const) for (const layout of [1, 2, 3]) {
    const name = `synthetic-${kind}-${layout}`, ctx = { ...context, accountKind: kind };
    it(`${name}: generic CSV`, () => { const rows = parseTable(csvRows(readFileSync(resolve('fixtures/ingest', name + '.csv'), 'utf8'))).map(r => normalizeRow(r, ctx)); expect(rows.map(r => r.minor)).toEqual(['-1000', '-2000', '-3000']); });
    it(`${name}: actual positional PDF${layout === 3 ? ' with page break' : ''}`, async () => { const extraction = await extractFixture(name); const rows = positionalTable(extraction.items).map(r => normalizeRow(r, ctx)); expect(rows.map(r => r.minor)).toEqual(['-1000', '-2000', '-3000']); expect(extraction.pages).toBe(layout === 3 ? 2 : 1); });
  }
  for (const layout of [1, 2, 3]) it(`payslip layout ${layout}: actual PDF`, async () => { const extraction = await extractFixture(`synthetic-payslip-${layout}`); const text = textLines(extraction.items).map(l => l.items.map(i => i.text).join(' ')).join('\n'); const pay = parsePayslip(text, context); expect(pay.net).toBe('160000'); expect(pay.gross).toBe('200000'); expect(pay.ytd.Gross).toBe('1200000'); });
  for (const kind of ['checking', 'savings', 'credit', 'payslip']) it(`${kind}: image-only PDF needs OCR, never silently empty`, async () => { const extraction = await extractFixture(`synthetic-${kind}-scan`); expect(extraction.items).toEqual([]); });
});

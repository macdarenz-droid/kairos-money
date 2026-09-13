import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeRow } from '../src/ingest/normalize';
import { positionalTable, textLines, type TextItem } from '../src/ingest/parse/positional';
import { parsePayslip } from '../src/ingest/parse/payslip';
import type { ImportContext } from '../src/ingest/types';

// Consumes only JSON captured by bundled ML Kit on the synthetic Android test device.
const directory = resolve(process.argv[2] ?? 'docs/evidence/android-screens-current');
const context: ImportContext = { accountId: 'synthetic', accountKind: 'checking', currency: 'AUD', period: { start: '2026-01-01', end: '2026-01-31' }, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: true };
const report: { kind: string; status: string; rows: number }[] = [];
for (const kind of ['checking', 'savings', 'credit', 'payslip'] as const) {
  const value: unknown = JSON.parse(readFileSync(resolve(directory, `ocr-${kind}.json`), 'utf8'));
  assert(value && typeof value === 'object' && 'items' in value && Array.isArray(value.items), 'Missing native OCR items');
  const items: TextItem[] = value.items.map((item: unknown) => {
    assert(item && typeof item === 'object' && 'text' in item && typeof item.text === 'string' && 'x' in item && typeof item.x === 'number' && 'y' in item && typeof item.y === 'number' && 'width' in item && typeof item.width === 'number', 'Invalid native OCR item');
    assert('height' in item && typeof item.height === 'number' && item.height > 0, 'Native OCR glyph height missing');
    return { text: item.text, x: item.x, y: item.y, width: item.width, height: item.height, page: 1 };
  });
  if (kind === 'payslip') {
    const text = textLines(items).map(line => line.items.map(item => item.text).join(' ')).join('\n');
    const pay = parsePayslip(text, context);
    assert.equal(pay.gross, '200000'); assert.equal(pay.net, '160000'); assert.equal(pay.tax, '40000'); assert.equal(pay.super, '24000'); assert.equal(pay.ytd.Gross, '1200000');
    report.push({ kind, status: 'PASS', rows: 1 });
  } else {
    const rows = positionalTable(items, true).map(row => normalizeRow(row, { ...context, accountKind: kind }));
    assert.deepEqual(rows.map(row => row.minor), ['-1000', '-2000', '-3000']);
    assert.deepEqual(rows.map(row => row.date), ['2026-01-01', '2026-01-02', '2026-01-03']);
    assert(rows.every(row => row.confidence < 9000), 'OCR rows must require review');
    report.push({ kind, status: 'PASS', rows: rows.length });
  }
}
writeFileSync(resolve(directory, 'ocr-parser-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));

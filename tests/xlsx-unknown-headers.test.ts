// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractXlsx } from '../src/ingest/extract/xlsx';
import { MappingRequired, parseExport } from '../src/ingest/sources/inference';
const utf8 = (s: string) => new Uint8Array(strToU8(s));
it('reads a sheet whose headers it does not know, so the owner can map the columns', () => {
  const cell = (r: string, text: string) => `<c r="${r}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheet = `<worksheet><sheetData><row>${cell('A1', 'When')}${cell('B1', 'What')}${cell('C1', 'How much')}</row><row><c r="A2"><v>46023</v></c>${cell('B2', 'Synthetic shop')}<c r="C2"><v>-12.5</v></c></row></sheetData></worksheet>`;
  const rows = extractXlsx(zipSync({'xl/workbook.xml': utf8('<workbook><workbookPr/></workbook>'), 'xl/worksheets/sheet1.xml': utf8(sheet)}));
  expect(rows).toEqual([['When', 'What', 'How much'], ['2026-01-01', 'Synthetic shop', '-12.5']]);
  const context = {accountId: 'a', accountKind: 'checking' as const, currency: 'AUD' as const, period: {start: '2026-01-01', end: '2026-01-31'}, dateOrder: 'DMY' as const, decimal: '.' as const, creditPositivePurchases: false};
  expect(() => parseExport(rows, context)).toThrow(MappingRequired);
});

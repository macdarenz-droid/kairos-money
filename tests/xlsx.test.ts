// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractXlsx, expandDecimal } from '../src/ingest/extract/xlsx';
const utf8 = (s: string) => new Uint8Array(strToU8(s));
function workbook(cell: string) { return zipSync({ 'xl/workbook.xml': utf8('<workbook><workbookPr/></workbook>'), 'xl/worksheets/sheet1.xml': utf8(`<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Date</t></is></c><c r="B1" t="inlineStr"><is><t>Description</t></is></c><c r="C1" t="inlineStr"><is><t>Amount</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>2026-01-01</t></is></c><c r="B2" t="inlineStr"><is><t>Synthetic merchant</t></is></c>${cell}</row></sheetData></worksheet>`) }); }
it('preserves spreadsheet decimal strings without numeric conversion', () => { expect(extractXlsx(workbook('<c r="C2"><v>-900719925474.01</v></c>'))[1]?.[2]).toBe('-900719925474.01'); expect(expandDecimal('1.2345E-3')).toBe('0.0012345'); expect(expandDecimal('-1.2345E3')).toBe('-1234.5'); });
it('rejects spreadsheet formulas rather than importing a stale cached result', () => { expect(() => extractXlsx(workbook('<c r="C2"><f>1+2</f><v>3</v></c>'))).toThrow('values only'); });

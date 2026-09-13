import { unzipSync, strFromU8 } from 'fflate';
import { ImportFailure } from '../types';
import { inferColumns } from '../parse/csv';
import { shiftDay } from '../normalize';
function xml(text: string): XMLDocument { if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Spreadsheet document entities are not supported. Export CSV.'); const document = new DOMParser().parseFromString(text, 'application/xml'); if (document.querySelector('parsererror')) throw new Error('Spreadsheet XML is damaged. Export the sheet again.'); return document; }
export function expandDecimal(value: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?[Ee]([+-]?\d+)$/.exec(value); if (!m) return value;
  const exponent = Number(m[4]); if (Math.abs(exponent) > 30) throw new Error('A spreadsheet value is outside the supported range.');
  const digits = m[2]! + (m[3] ?? ''), point = m[2]!.length + exponent;
  return m[1]! + (point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point));
}
export function extractXlsx(bytes: Uint8Array): string[][] {
  let total = 0; const files = unzipSync(bytes, { filter: file => { total += file.originalSize; if (total > 33554432) throw new Error('The expanded workbook exceeds 32 MB. Export only the statement sheet as CSV.'); return /^(xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml))$/.test(file.name); } });
  const sheets = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (sheets.length !== 1) throw new ImportFailure('The workbook opened.', `${sheets.length} worksheets were found.`, sheets.join(', '), 'Export the statement worksheet alone as XLSX or CSV.');
  const strings = files['xl/sharedStrings.xml'] ? [...xml(strFromU8(files['xl/sharedStrings.xml'])).querySelectorAll('si')].map(si => [...si.querySelectorAll('t')].map(t => t.textContent ?? '').join('')) : [];
  const sheet = xml(strFromU8(files[sheets[0]!]!));
  const rows = [...sheet.querySelectorAll('sheetData > row')].map(r => {
    const cells: string[] = [];
    for (const c of r.querySelectorAll('c')) {
      if (c.querySelector('f')) throw new ImportFailure('Spreadsheet cells were read.', 'A formula occurs in the statement table.', c.getAttribute('r') ?? '', 'Export values only so stale formula results cannot enter your ledger.');
      const letters = /^[A-Z]+/.exec(c.getAttribute('r') ?? '')?.[0]; if (!letters) throw new Error('A spreadsheet cell has no address. Export CSV.');
      let index = 0; for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
      if (index > 100) throw new Error('The statement has too many columns. Export the transaction table alone.');
      while (cells.length < index) cells.push('');
      const raw = c.querySelector('v')?.textContent ?? '';
      cells[index - 1] = c.getAttribute('t') === 's' ? strings[Number(raw)] ?? '' : c.getAttribute('t') === 'inlineStr' ? c.querySelector('is')?.textContent ?? '' : expandDecimal(raw);
    }
    return cells;
  }).filter(r => r.some(Boolean));
  const width = rows[0]?.length ?? 0; rows.forEach(r => { while (r.length < width) r.push(''); });
  const mapping = inferColumns(rows[0] ?? []);
  const is1904 = files['xl/workbook.xml'] ? xml(strFromU8(files['xl/workbook.xml'])).querySelector('workbookPr')?.getAttribute('date1904') === '1' : false;
  for (const row of rows.slice(1)) { const value = row[mapping.date] ?? ''; if (/^\d{1,6}$/.test(value)) { const serial = Number(value); if (!is1904 && serial === 60) throw new Error('Excel contains the nonexistent 29 February 1900. Correct the date.'); row[mapping.date] = shiftDay(is1904 ? '1904-01-01' : serial < 60 ? '1899-12-31' : '1899-12-30', serial); } }
  return rows;
}

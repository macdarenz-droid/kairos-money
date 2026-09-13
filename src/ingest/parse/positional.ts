import { ImportFailure, type RawRow } from '../types';
import { inferColumns, parseTable } from './csv';
export type TextItem = { text: string; x: number; y: number; width: number; height?: number; page: number };
export function textLines(items: readonly TextItem[]): { page: number; y: number; items: TextItem[] }[] {
  const lines: { page: number; y: number; items: TextItem[] }[] = [];
  for (const item of [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)) {
    const last = lines.at(-1);
    // OCR boxes vary slightly between columns. Scale tolerance to glyph height,
    // without allowing a full adjacent text line to collapse into this one.
    const tolerance = last ? Math.max(3, Math.floor(Math.min(item.height ?? 10, ...last.items.map(i => i.height ?? 10)) * 3 / 10)) : 3;
    if (last && last.page === item.page && Math.abs(last.y - item.y) <= tolerance) last.items.push(item);
    else lines.push({ page: item.page, y: item.y, items: [item] });
  }
  return lines.map(line => ({ ...line, items: line.items.sort((a, b) => a.x - b.x) }));
}
export function positionalTable(items: readonly TextItem[], ocr = false): RawRow[] {
  const lines = textLines(items); let header: TextItem[] | null = null; const table: string[][] = []; let started = false; let currentPage = 0;
  for (const line of lines) {
    if (line.page !== currentPage) { started = false; currentPage = line.page; }
    const cells = line.items.sort((a, b) => a.x - b.x);
    try { inferColumns(cells.map(c => c.text)); header = cells; if (!table.length) table.push(cells.map(c => c.text)); started = true; continue; } catch { /* A non-header line is processed using the last confirmed header. */ }
    if (!header || !started) continue;
    const text = cells.map(c => c.text).join(' ');
    if (/^(?:page \d+|closing balance|opening balance|total\b|statement period)/i.test(text)) continue;
    const row = header.map(() => '');
    for (const cell of cells) { let index = 0; for (let i = 1; i < header.length; i++) if (cell.x >= header[i]!.x - 8) index = i; row[index] = [row[index], cell.text].filter(Boolean).join(' '); }
    const mapping = inferColumns(header.map(h => h.text));
    if (!row[mapping.date]?.trim()) { const previous = table.at(-1); if (previous && table.length > 1 && row.every((v, i) => i === mapping.description || !v)) previous[mapping.description] = [previous[mapping.description], row[mapping.description]].filter(Boolean).join(' '); else throw new ImportFailure('A transaction table was found.', 'A continuation line has unclear columns.', text, 'Map this page using a CSV export or correct the source layout.'); }
    else if (/^\d{1,4}[/.-]\d{1,2}/.test(row[mapping.date]!)) table.push(row);
    else throw new ImportFailure('The table header was identified.', 'A line inside the transaction table could not be classified.', text, 'Use a CSV export or select the correct statement pages.');
  }
  if (table.length < 2) throw new ImportFailure('PDF text was extracted.', 'No supported positional transaction table was found.', lines.slice(0, 8).map(l => l.items.map(i => i.text).join(' ')).join('\n'), 'Export CSV, or use the column mapping screen for a delimited statement.');
  return parseTable(table, undefined, ocr ? 7000 : 9300);
}

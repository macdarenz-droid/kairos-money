import { ImportFailure, type RawRow } from '../types';
import { inferColumns, parseTable } from './csv';

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
/** A date cell must be ENTIRELY a date. "ABN 33 007 457 141" begins like one; a statement footer is not
 *  a transaction, and a parser that accepts anything starting with digits will import the page number. */
const DATE_CELL = new RegExp(`^(?:\\d{1,4}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|\\d{1,2}[\\s.-]+${MONTH}[\\s.-]+\\d{2,4}|${MONTH}[\\s.-]+\\d{1,2},?[\\s.-]+\\d{2,4})$`, 'i');
const AMOUNT_CELL = /^[+-]?\s*(?:[A-Z]{3}\s*)?[$£€₱]?\s*\d[\d,. ]*\d(?:\s*(?:DR|CR))?$|^[+-]?\s*[$£€₱]?\s*\d(?:\s*(?:DR|CR))?$/i;
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
/**
 * Any positional statement table, whatever its columns are called and wherever its description sits.
 *
 * THE LAYOUT THIS EXISTS FOR. Plenty of banks do not put a transaction on one line. A Westpac
 * transactions report prints the description on the lines ABOVE AND BELOW its own amounts:
 *
 *   y490   CARD PURCHASE SEVEN SEAS                 <- description, no date
 *   y495   15 Sep 2026    -$12.50       $487.50      <- the dated line
 *   y499   COFFEE 12/09                              <- description, no date
 *
 * The previous version could only fold a dateless line into the row BEFORE it, so the first line of the
 * first transaction had nothing to attach to and the import died on row one. Folding forward instead
 * would be equally wrong — the line above transaction two would land on transaction one.
 *
 * So a description line joins the dated line it is NEAREST to. That needs no rule about which direction a
 * bank wraps in, and gets both halves of a three-line row right at once.
 *
 * HOW NEAR IS NEAR. The ceiling is taken from the statement itself: half the median gap between dated
 * lines on the page. A page whose rows are 30 apart accepts fragments within 15 and cannot reach the next
 * transaction; a densely printed page tightens automatically. Nothing here is tuned to one bank.
 *
 * Anything outside the table's own columns — page footers, closing paragraphs, the copyright line — is
 * left where it is rather than being attached to the nearest transaction.
 */
export function positionalTable(items: readonly TextItem[], ocr = false): RawRow[] {
  const lines = textLines(items);
  type Record = { page: number; y: number; cells: string[]; parts: { y: number; text: string }[] };
  const records: Record[] = [];
  const fragments: { page: number; y: number; cells: string[] }[] = [];
  let header: TextItem[] | null = null;
  let mapping: ReturnType<typeof inferColumns> | null = null;
  let width = 0;

  for (const line of lines) {
    const cells = line.items;
    // A header re-anchors the columns beneath it, which is how repeated headers on later pages work.
    try { const found = inferColumns(cells.map(c => c.text)); header = cells; mapping = found; width = cells.length; continue; }
    catch { /* Not a header. Read it against the last one. */ }
    if (!header || !mapping) continue;

    const text = cells.map(c => c.text).join(' ');
    if (/^(?:page \d+|closing balance|opening balance|total\b|statement period)/i.test(text)) continue;

    const money = [mapping.amount, mapping.debit, mapping.credit, mapping.balance]
      .filter((i): i is number => i !== null && i !== undefined);
    const row = new Array<string>(width).fill('');
    for (const cell of cells) {
      let index = 0;
      for (let i = 1; i < header.length; i++) if (cell.x >= header[i]!.x - 8) index = i;
      // Money columns print right-aligned, so once a cell is known to be IN the money region it belongs
      // to whichever of those columns its right edge ends nearest: a balance of $10,000.00 starts further
      // left than a three-figure one and would otherwise fall into the column before it.
      //
      // Only within that region. An earlier version refined any number-shaped cell and pulled a fee
      // amount — the tail of a "... incl. Foreign Transaction Fee AUD $x.xx" note, printed on its own
      // line in the description column — into the withdrawal column of an unrelated transaction.
      if (money.includes(index) && AMOUNT_CELL.test(cell.text)) index = money.reduce((best, i) =>
        Math.abs((cell.x + cell.width) - (header![i]!.x + header![i]!.width))
          < Math.abs((cell.x + cell.width) - (header![best]!.x + header![best]!.width)) ? i : best);
      row[index] = [row[index], cell.text].filter(Boolean).join(' ');
    }

    if (DATE_CELL.test((row[mapping.date] ?? '').trim())) { records.push({ page: line.page, y: line.y, cells: row, parts: row[mapping.description] ? [{ y: line.y, text: row[mapping.description]! }] : [] }); continue; }
    // Everything else on a table line is a piece of a transaction printed on its own line — a wrapped
    // description, or an amount that drifted a few points off its date and so grouped separately. Both
    // are the same problem and take the same answer: attach to the nearest dated line, in their own
    // column. The first version handled only descriptions, and a lone amount stopped the import.
    if (row.some((value, i) => value && i !== mapping!.description)
      && !money.some(i => AMOUNT_CELL.test((row[i] ?? '').trim()))) continue;
    // Page furniture sits inside the column bounds often enough that position alone cannot exclude it —
    // the copyright line, "Page 3 of 7", the closing paragraphs. What separates them from a transaction
    // is that nothing in a money column is a number, and they carry no description either.
    if (row.some(Boolean)) fragments.push({ page: line.page, y: line.y, cells: row });
  }

  if (records.length < 1 || !header || !mapping) throw new ImportFailure('PDF text was extracted.', 'No supported positional transaction table was found.', lines.slice(0, 8).map(l => l.items.map(i => i.text).join(' ')).join('\n'), 'Export CSV, or use the column mapping screen for a delimited statement.');

  for (const page of new Set(records.map(r => r.page))) {
    const dated = records.filter(r => r.page === page).sort((a, b) => a.y - b.y);
    const gaps = dated.slice(1).map((r, i) => r.y - dated[i]!.y).sort((a, b) => a - b);
    // One row on a page tells us nothing about its spacing, so nothing is rejected for distance there.
    const reach = gaps.length ? gaps[Math.floor(gaps.length / 2)]! / 2 : Number.POSITIVE_INFINITY;
    for (const fragment of fragments.filter(f => f.page === page)) {
      const nearest = dated.reduce((best, row) => Math.abs(row.y - fragment.y) < Math.abs(best.y - fragment.y) ? row : best);
      if (Math.abs(nearest.y - fragment.y) > reach) continue;
      for (const [column, value] of fragment.cells.entries()) {
        if (!value) continue;
        // Description parts keep their own y and are joined at the end, top to bottom. Prepending or
        // appending as they arrived put two lines printed ABOVE a transaction in the wrong order.
        if (column === mapping.description) nearest.parts.push({ y: fragment.y, text: value });
        else if (!nearest.cells[column]) nearest.cells[column] = value;
        // Two different values for one column of one transaction is not something to resolve by guessing.
        else if (nearest.cells[column] !== value) throw new ImportFailure('A transaction table was found.', 'Two values claim the same column of one transaction.', `${nearest.cells[mapping.date]} ${nearest.cells[column]} / ${value}`, 'Map this page using a CSV export or correct the source layout.');
      }
    }
  }

  for (const record of records) record.cells[mapping.description] = record.parts.sort((a, b) => a.y - b.y).map(p => p.text).join(' ').trim();
  const table = [header.map(h => h.text), ...records.map(r => r.cells)];
  return parseTable(table, undefined, ocr ? 7000 : 9300);
}

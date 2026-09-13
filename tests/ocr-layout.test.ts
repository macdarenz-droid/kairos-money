import { describe, expect, it } from 'vitest';
import { positionalTable, textLines, type TextItem } from '../src/ingest/parse/positional';

const item = (text: string, x: number, y: number, height = 26): TextItem => ({ text, x, y, width: text.length * 12, height, page: 1 });
describe('OCR column alignment', () => {
  it('keeps a row together despite independent column box jitter', () => {
    const rows = positionalTable([
      item('Date', 97, 270), item('Description', 406, 269), item('Amount', 1021, 268),
      item('01/01/2026', 97, 353), item('Synthetic merchant A', 405, 349), item('-10.00', 1024, 351),
      item('02/01/2026', 97, 425), item('Synthetic merchant B', 405, 424), item('-20.00', 1022, 422),
    ], true);
    expect(rows.map(row => [row.date, row.description, row.amount])).toEqual([
      ['01/01/2026', 'Synthetic merchant A', '-10.00'], ['02/01/2026', 'Synthetic merchant B', '-20.00'],
    ]);
    expect(rows.every(row => row.confidence === 7000)).toBe(true);
  });
  it('orders payslip labels before values even when the value box starts higher', () => {
    const lines = textLines([item('1600.00', 620, 517), item('Net:', 97, 520), item('Tax:', 97, 548), item('400.00', 618, 546)]);
    expect(lines.map(line => line.items.map(value => value.text).join(' '))).toEqual(['Net: 1600.00', 'Tax: 400.00']);
  });
  it('keeps adjacent lines and pages separate', () => {
    expect(textLines([item('First', 0, 10), item('Second', 0, 30), { ...item('Other page', 0, 10), page: 2 }])).toHaveLength(3);
  });
});

import type { Extracted } from '../extract';
import type { ImportContext, RawRow } from '../types';
import { ImportFailure } from '../types';
import { parseTable, type Columns } from './csv';
import { parseOfx, parseQif } from './structured';
import { positionalTable } from './positional';
export interface Parser { id: string; matches(extracted: Extracted): boolean; parse(extracted: Extracted, context: ImportContext, mapping?: Columns): RawRow[] }
export const parsers: readonly Parser[] = [
  { id: 'generic-table-v1', matches: e => e.table !== null, parse: (e, _c, mapping) => parseTable(e.table ?? [], mapping) },
  { id: 'ofx-v1', matches: e => e.kind === 'ofx', parse: e => parseOfx(e.text) },
  { id: 'qif-v1', matches: e => e.kind === 'qif', parse: e => parseQif(e.text) },
  { id: 'positional-table-v1', matches: e => e.kind === 'pdf' || e.kind === 'image', parse: e => positionalTable(e.items, e.ocr) },
];
export function parse(extracted: Extracted, context: ImportContext, mapping?: Columns, registry: readonly Parser[] = parsers) {
  const parser = registry.find(p => p.matches(extracted)); if (!parser) throw new ImportFailure('The file was extracted.', 'No parser matched its structure.', extracted.text.slice(0, 300), 'Export a CSV with date, description and amount columns.');
  return { rows: parser.parse(extracted, context, mapping), parser: parser.id };
}

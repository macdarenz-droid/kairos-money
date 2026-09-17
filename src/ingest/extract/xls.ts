import { ImportFailure } from '../types';
import { inferColumns } from '../parse/csv';
import { datedSheet } from './xlsx';

/**
 * Legacy Excel (.xls), the format Australian banks still hand out by default.
 *
 * Westpac's "export transactions" button produces one of these, and until now Kairos rejected it as an
 * unidentifiable binary — the person is then told to go and find a different button, which is the app
 * failing at the first thing it is for.
 *
 * It is NOT the .xlsx this app already reads. That is a ZIP of XML; this is OLE2, a filesystem-in-a-file
 * from 1997, holding a stream of binary records. There is no library here for either, and adding one for
 * a decade-old format is a dependency this app should not carry, so it is read directly.
 *
 * WHAT IS DELIBERATELY NOT IMPLEMENTED. Formulas, RK-compressed numbers, rich text and charts are all
 * part of the format and none of them appear in a bank's transaction export. Each is REFUSED by name
 * rather than guessed at: a half-understood formula result is a wrong number in a ledger, which is worse
 * than a file that will not open. The failure says which record it choked on so the next person is not
 * reverse-engineering it from scratch.
 */

/** Everything past this is a workbook, not a statement. */
const MAX_STREAM = 33554432;
const MAX_COLUMNS = 100;
const MAX_ROWS = 100000;

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
export function isLegacyExcel(bytes: Uint8Array): boolean {
  return OLE_MAGIC.every((byte, i) => bytes[i] === byte);
}

type Record = { type: number; offset: number; data: DataView };

/**
 * The OLE2 container: a FAT-chained block device with a directory, inside one file.
 *
 * Only what a workbook needs is implemented — the sector chain, the directory, and the mini stream that
 * small workbooks live in. A file that needs more than the header's own DIFAT is refused rather than
 * half-read.
 */
function workbookStream(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 512) throw new ImportFailure('The file opened.', 'This .xls file is truncated.', '', 'Download the export again.');
  const sectorSize = 1 << view.getUint16(30, true), miniSize = 1 << view.getUint16(32, true);
  if (sectorSize < 128 || sectorSize > 4096) throw new ImportFailure('The file opened.', 'This .xls file declares an unusable sector size.', String(sectorSize), 'Export the statement as CSV.');
  const sectorAt = (n: number) => 512 + n * sectorSize;
  const END = 0xfffffffa;

  if (view.getUint32(72, true) > 0) throw new ImportFailure('The file opened.', 'This .xls workbook is too large for the direct reader.', '', 'Export the statement as CSV or XLSX.');
  const fat: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sector = view.getUint32(76 + i * 4, true);
    if (sector >= END) break;
    for (let offset = 0; offset < sectorSize; offset += 4) fat.push(view.getUint32(sectorAt(sector) + offset, true));
  }
  const chain = (start: number) => { const out: number[] = []; let s = start; while (s < END && out.length * sectorSize <= MAX_STREAM) { out.push(s); s = fat[s] ?? END; } return out; };
  const read = (start: number, size: number, blockSize: number, base: Uint8Array | null) => {
    const sectors = base ? chain(start) : chain(start);
    const out = new Uint8Array(Math.min(size, MAX_STREAM));
    let written = 0;
    for (const sector of sectors) {
      if (written >= out.length) break;
      const from = base ? sector * blockSize : sectorAt(sector);
      const slice = (base ?? bytes).subarray(from, from + blockSize);
      out.set(slice.subarray(0, out.length - written), written);
      written += slice.length;
    }
    return out;
  };

  const directory = read(view.getUint32(48, true), MAX_STREAM, sectorSize, null);
  let workbook: { start: number; size: number } | null = null;
  let root: { start: number; size: number } | null = null;
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory[offset + 64]! | (directory[offset + 65]! << 8);
    if (nameLength < 2 || nameLength > 64) continue;
    const name = new TextDecoder('utf-16le').decode(directory.subarray(offset, offset + nameLength - 2));
    const entry = new DataView(directory.buffer, directory.byteOffset + offset, 128);
    const found = { start: entry.getUint32(116, true), size: entry.getUint32(120, true) };
    if (directory[offset + 66] === 5) root = found;
    else if (name === 'Workbook' || name === 'Book') workbook = found;
  }
  if (!workbook) throw new ImportFailure('The file opened.', 'No workbook was found inside this .xls file.', '', 'Export the statement as CSV.');
  if (workbook.size > MAX_STREAM) throw new ImportFailure('The file opened.', 'This workbook exceeds 32 MB.', '', 'Export only the transaction sheet as CSV.');

  // Streams below the cutoff live packed inside the root entry's own stream, not in the main sectors.
  const cutoff = view.getUint32(56, true);
  if (workbook.size >= cutoff || !root) return read(workbook.start, workbook.size, sectorSize, null);
  const miniFat: number[] = [];
  for (const sector of chain(view.getUint32(60, true))) for (let offset = 0; offset < sectorSize; offset += 4) miniFat.push(view.getUint32(sectorAt(sector) + offset, true));
  const mini = read(root.start, MAX_STREAM, sectorSize, null);
  const out = new Uint8Array(workbook.size);
  let written = 0, block = workbook.start;
  while (block < END && written < out.length) {
    const slice = mini.subarray(block * miniSize, block * miniSize + miniSize);
    out.set(slice.subarray(0, out.length - written), written);
    written += slice.length;
    block = miniFat[block] ?? END;
  }
  return out;
}

function records(stream: Uint8Array): Record[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const out: Record[] = [];
  for (let offset = 0; offset + 4 <= stream.length;) {
    const type = view.getUint16(offset, true), length = view.getUint16(offset + 2, true);
    if (offset + 4 + length > stream.length) break;
    out.push({ type, offset, data: new DataView(stream.buffer, stream.byteOffset + offset + 4, length) });
    offset += 4 + length;
  }
  return out;
}

/**
 * The shared string table, which is the one genuinely awkward part of the format.
 *
 * A single string can be cut in half by a record boundary, and the half in the next record carries its
 * OWN width flag — the first part may be one byte per character and the remainder two. Reading the
 * pieces as if they shared a width produces silent mojibake in merchant names rather than an error, so
 * the boundary is tracked explicitly.
 */
function sharedStrings(all: Record[], sstIndex: number): string[] {
  const parts = [all[sstIndex]!.data];
  for (let i = sstIndex + 1; i < all.length && all[i]!.type === 0x003c; i++) parts.push(all[i]!.data);
  let part = 0, offset = 8;                       // Past the SST's total/unique counts.
  const unique = parts[0]!.getUint32(4, true);
  const byte = () => { while (part < parts.length && offset >= parts[part]!.byteLength) { part++; offset = 0; } return part < parts.length ? parts[part]!.getUint8(offset++) : -1; };
  const strings: string[] = [];
  for (let i = 0; i < unique && i < 1048576; i++) {
    const low = byte(), high = byte();
    if (low < 0 || high < 0) break;
    let remaining = low | (high << 8);
    let flags = byte();
    if (flags < 0) break;
    if (flags & 0x08) { byte(); byte(); }                       // Rich-text run count, unused.
    if (flags & 0x04) { byte(); byte(); byte(); byte(); }       // Far-East extension size, unused.
    let text = '';
    while (remaining > 0) {
      if (part >= parts.length) break;
      if (offset >= parts[part]!.byteLength) {
        // A new record begins mid-string, and it restates the width of what is left.
        part++; offset = 0;
        if (part >= parts.length) break;
        flags = parts[part]!.getUint8(offset++);
      }
      if (flags & 0x01) { text += String.fromCharCode(parts[part]!.getUint16(offset, true)); offset += 2; }
      else { text += String.fromCharCode(parts[part]!.getUint8(offset)); offset += 1; }
      remaining--;
    }
    strings.push(text);
  }
  return strings;
}

export function extractXls(bytes: Uint8Array): string[][] {
  const all = records(workbookStream(bytes));
  const sstIndex = all.findIndex(r => r.type === 0x00fc);
  const strings = sstIndex >= 0 ? sharedStrings(all, sstIndex) : [];

  const is1904 = all.some(r => r.type === 0x0022 && r.data.getUint16(0, true) === 1);

  // Sheet names are a short unicode string: a length, a flags byte, then one or two bytes per character.
  const sheets = all.filter(r => r.type === 0x0085 && r.data.getUint8(5) === 0).map(record => {
    const d = record.data, length = d.getUint8(6), wide = (d.getUint8(7) & 1) === 1;
    const bytes = new Uint8Array(d.buffer, d.byteOffset + 8, Math.min(length * (wide ? 2 : 1), d.byteLength - 8));
    return { name: new TextDecoder(wide ? 'utf-16le' : 'latin1').decode(bytes), position: d.getUint32(0, true) };
  }).sort((a, b) => a.position - b.position);
  if (!sheets.length) throw new ImportFailure('The workbook opened.', 'No worksheet was found in this .xls file.', '', 'Export the statement as CSV.');

  // A bank export is a workbook, not a sheet: Westpac ships "Transactions" beside a "Report Info" tab.
  // Refusing the file for that would be refusing the bank's own standard download. Each sheet is read,
  // and the one whose header the column reader RECOGNISES is the statement — the same code that decides
  // a CSV's columns decides this, so there is one definition of "a transaction table" and not two.
  const readable = sheets.map((sheet, index) => {
    const end = sheets[index + 1]?.position ?? Infinity;
    const rows = grid(all.filter(r => r.offset >= sheet.position && r.offset < end), strings);
    let usable = false;
    try { inferColumns(rows[0] ?? []); usable = rows.length > 1; } catch { usable = false; }
    return { name: sheet.name, rows, usable };
  });
  const found = readable.filter(sheet => sheet.usable);
  if (found.length > 1) throw new ImportFailure('The workbook opened.', `${found.length} sheets look like transaction tables.`, found.map(s => s.name).join(', '), 'Export the statement worksheet alone as CSV or XLSX.');
  // With nothing recognisable, hand over the largest sheet so the column-mapping screen can be used —
  // the same escape hatch a CSV with odd headings already gets.
  const sheet = found[0] ?? readable.reduce((most, s) => s.rows.length > most.rows.length ? s : most, readable[0]!);
  if (!sheet.rows.length) throw new ImportFailure('The workbook opened.', 'No cells were found in this .xls file.', '', 'Export the statement as CSV.');
  return datedSheet(sheet.rows, is1904);
}

function grid(sheetRecords: readonly Record[], strings: readonly string[]): string[][] {
  const cells = new Map<number, Map<number, string>>();
  const put = (row: number, column: number, text: string) => {
    if (column >= MAX_COLUMNS) throw new ImportFailure('The sheet opened.', 'The statement has too many columns.', String(column + 1), 'Export the transaction table alone.');
    if (cells.size > MAX_ROWS) throw new ImportFailure('The sheet opened.', 'The statement has too many rows.', '', 'Export a shorter date range.');
    if (!cells.has(row)) cells.set(row, new Map());
    cells.get(row)!.set(column, text);
  };
  for (const record of sheetRecords) {
    const d = record.data;
    if (record.type === 0x00fd) put(d.getUint16(0, true), d.getUint16(2, true), strings[d.getUint32(6, true)] ?? '');
    // A double is what the format stores. It becomes its shortest exact decimal here and is never used
    // as a number again — the amount is parsed from that text by the same code that reads a CSV.
    else if (record.type === 0x0203) put(d.getUint16(0, true), d.getUint16(2, true), String(d.getFloat64(6, true)));
    else if (record.type === 0x0201) put(d.getUint16(0, true), d.getUint16(2, true), '');
    else if (record.type === 0x0006) throw new ImportFailure('The sheet opened.', 'A formula occurs in the statement table.', '', 'Export values only, so a stale formula result cannot enter your ledger.');
    else if (record.type === 0x027e || record.type === 0x00bd) throw new ImportFailure('The sheet opened.', 'This workbook uses compressed numbers the reader does not decode.', '', 'Export the statement as CSV or XLSX.');
  }
  return [...cells.keys()].sort((a, b) => a - b).map(index => {
    const row = cells.get(index)!;
    const width = Math.max(...row.keys()) + 1;
    return Array.from({ length: width }, (_, column) => row.get(column) ?? '');
  }).filter(row => row.some(Boolean));
}

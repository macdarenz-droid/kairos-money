import {describe, expect, it} from 'vitest';
import {extractXls, isLegacyExcel} from '../src/ingest/extract/xls';
import {detect} from '../src/ingest/detect';

/**
 * Every workbook here is BUILT BY THESE TESTS, byte by byte. A real bank export cannot be committed —
 * it is somebody's statement — so the fixtures are assembled from the format's own rules instead. That
 * is not a workaround: a builder that has to produce a valid OLE2 container and valid BIFF records is a
 * second, independent statement of what the reader is supposed to accept.
 */

const END = 0xfffffffe, FAT_SECTOR = 0xfffffffd, FREE = 0xffffffff;

function record(type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint16(0, type, true);
  new DataView(out.buffer).setUint16(2, payload.length, true);
  out.set(payload, 4);
  return out;
}
const bytes = (...values: number[]) => new Uint8Array(values);
function u16(value: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, value, true); return b; }
function u32(value: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); return b; }
function f64(value: number) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, value, true); return b; }
const join = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const ascii = (text: string) => new Uint8Array([...text].map(c => c.charCodeAt(0)));

type Cell = string | number | null;
/** One worksheet: a BOF, its cells, an EOF. Strings are indexes into the shared table. */
function sheetRecords(rows: Cell[][], index: (text: string) => number, inside: Uint8Array[] = []): Uint8Array {
  const out = [record(0x0809, join(u16(0x0600), u16(0x0010), new Uint8Array(12))), ...inside];
  rows.forEach((row, r) => row.forEach((cell, c) => {
    if (cell === null) out.push(record(0x0201, join(u16(r), u16(c), u16(0))));
    else if (typeof cell === 'number') out.push(record(0x0203, join(u16(r), u16(c), u16(0), f64(cell))));
    else out.push(record(0x00fd, join(u16(r), u16(c), u16(0), u32(index(cell)))));
  }));
  out.push(record(0x000a, new Uint8Array(0)));
  return join(...out);
}

/** A whole workbook stream: globals (names, shared strings), then each sheet. */
function workbook(sheets: {name: string; rows: Cell[][]; inside?: Uint8Array[]}[], options: {is1904?: boolean} = {}): Uint8Array {
  const table: string[] = [];
  const index = (text: string) => { const found = table.indexOf(text); return found >= 0 ? found : table.push(text) - 1; };
  const bodies = sheets.map(s => sheetRecords(s.rows, index, s.inside));
  const sst = record(0x00fc, join(u32(table.length), u32(table.length),
    ...table.map(text => join(u16(text.length), bytes(0), ascii(text)))));

  // BOUNDSHEET carries each sheet's byte offset, so the globals must be sized before they are written.
  const boundSize = sheets.reduce((n, s) => n + 4 + 8 + s.name.length, 0);
  const head = 4 + 16 + (options.is1904 ? 6 : 0) + boundSize + sst.length + 4;
  let position = head;
  const bounds = sheets.map((s, i) => {
    const at = position; position += bodies[i]!.length;
    return record(0x0085, join(u32(at), bytes(0, 0), bytes(s.name.length, 0), ascii(s.name)));
  });
  return join(record(0x0809, join(u16(0x0600), u16(0x0005), new Uint8Array(12))),
    ...(options.is1904 ? [record(0x0022, u16(1))] : []),
    ...bounds, sst, record(0x000a, new Uint8Array(0)), ...bodies);
}

/**
 * Wrap a stream in a minimal OLE2 container.
 *
 * The layout is CHOSEN BY SIZE, exactly as Excel chooses it: anything under the 4 KB cutoff is packed
 * into the root entry's mini stream, and only larger workbooks get their own sectors. Building a small
 * file the other way round produces a container no real program would write, and the reader was right
 * to refuse it — that mistake is what this comment is for.
 */
function ole(stream: Uint8Array, mini = stream.length < 4096): Uint8Array {
  const SECTOR = 512;
  const pad = (data: Uint8Array, size: number) => { const out = new Uint8Array(Math.ceil(data.length / size) * size || size); out.set(data); return out; };
  const streamSectors = mini ? pad(stream, 64) : pad(stream, SECTOR);
  const dataSectors = mini ? 1 : streamSectors.length / SECTOR;   // In mini mode the payload rides in the root stream.
  const miniFatSectors = mini ? 1 : 0;

  const fat = new Uint8Array(SECTOR).fill(0xff);
  const fatView = new DataView(fat.buffer);
  fatView.setUint32(0, FAT_SECTOR, true);          // sector 0 is the FAT
  fatView.setUint32(4, END, true);                 // sector 1 is the directory
  let next = 2;
  const miniFatStart = mini ? next++ : FREE;
  if (mini) fatView.setUint32(miniFatStart * 4, END, true);
  const rootStart = next;
  const rootSectors = mini ? streamSectors.length / SECTOR : 0;
  for (let i = 0; i < rootSectors; i++) fatView.setUint32((next + i) * 4, i === rootSectors - 1 ? END : next + i + 1, true);
  next += rootSectors;
  const bookStart = mini ? 0 : next;
  if (!mini) for (let i = 0; i < dataSectors; i++) fatView.setUint32((next + i) * 4, i === dataSectors - 1 ? END : next + i + 1, true);

  const directory = new Uint8Array(SECTOR);
  const entry = (at: number, name: string, type: number, start: number, size: number) => {
    const utf16 = new Uint8Array([...name].flatMap(c => [c.charCodeAt(0), 0]));
    directory.set(utf16, at);
    const view = new DataView(directory.buffer, at, 128);
    view.setUint16(64, utf16.length + 2, true);
    directory[at + 66] = type;
    view.setUint32(116, start, true);
    view.setUint32(120, size, true);
  };
  entry(0, 'Root Entry', 5, mini ? rootStart : END, mini ? streamSectors.length : 0);
  entry(128, 'Workbook', 2, bookStart, stream.length);

  const miniFat = new Uint8Array(SECTOR).fill(0xff);
  if (mini) { const view = new DataView(miniFat.buffer); const blocks = streamSectors.length / 64;
    for (let i = 0; i < blocks; i++) view.setUint32(i * 4, i === blocks - 1 ? END : i + 1, true); }

  const header = new Uint8Array(SECTOR);
  header.set(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1));
  const h = new DataView(header.buffer);
  h.setUint16(30, 9, true); h.setUint16(32, 6, true);
  h.setUint32(44, 1, true); h.setUint32(48, 1, true); h.setUint32(56, 4096, true);
  h.setUint32(60, mini ? miniFatStart : END, true); h.setUint32(64, miniFatSectors, true);
  h.setUint32(68, END, true); h.setUint32(72, 0, true);
  header.fill(0xff, 76, 512);
  h.setUint32(76, 0, true);

  const body = [fat, directory, ...(mini ? [miniFat] : []), streamSectors];
  return join(header, ...body);
}

const statement = [
  ['Date', 'Description', 'Withdrawal', 'Deposit', 'Balance'],
  ['2026-09-15', 'SYNTHETIC GROCER', -4.9, null, 190.21],
  ['2026-09-14', 'SYNTHETIC FUEL', -13, null, 203.21],
] as Cell[][];

describe('legacy Excel', () => {
  it('is recognised by its own bytes, not by a file extension', () => {
    const file = ole(workbook([{name: 'Transactions', rows: statement}]));
    expect(isLegacyExcel(file)).toBe(true);
    // Banks name these .xls, .XLS and occasionally .xlsx. The magic is the only honest answer.
    expect(detect(file, 'anything.xlsx').kind).toBe('xls');
    expect(detect(file, 'NO-EXTENSION').kind).toBe('xls');
  });

  it('reads a statement sheet', () => {
    const rows = extractXls(ole(workbook([{name: 'Transactions', rows: statement}])));
    expect(rows[0]).toEqual(['Date', 'Description', 'Withdrawal', 'Deposit', 'Balance']);
    expect(rows[1]).toEqual(['2026-09-15', 'SYNTHETIC GROCER', '-4.9', '', '190.21']);
    // A whole number must not arrive as "-13.0" or "-13.00" — the amount reader is given the shortest
    // exact decimal and parses it the same way it parses a CSV.
    expect(rows[2]![2]).toBe('-13');
  });

  it('picks the transaction sheet out of a workbook that has more than one', () => {
    // Westpac ships "Report Info" beside "Transactions". Refusing the file for that would be refusing
    // the bank's own standard download.
    const file = ole(workbook([
      {name: 'Report Info', rows: [['Generated', '2026-09-16'], ['Account', 'SYNTHETIC']]},
      {name: 'Transactions', rows: statement},
    ]));
    const rows = extractXls(file);
    expect(rows).toHaveLength(3);
    expect(rows[1]![1]).toBe('SYNTHETIC GROCER');
  });

  it('refuses rather than guess when two sheets both look like statements', () => {
    const file = ole(workbook([
      {name: 'June', rows: statement},
      {name: 'July', rows: statement},
    ]));
    expect(() => extractXls(file)).toThrow(/look like transaction tables/);
  });

  it('turns date serial numbers into dates', () => {
    const serial = [
      ['Date', 'Description', 'Amount'],
      [46280, 'SYNTHETIC GROCER', -4.9],
    ] as Cell[][];
    expect(extractXls(ole(workbook([{name: 'Transactions', rows: serial}])))[1]![0]).toBe('2026-09-15');
  });

  it('honours a workbook written on the 1904 epoch', () => {
    // The same calendar day is a different serial on each epoch — 46280 against 1899-12-30, 44818
    // against 1904-01-01. Reading one file with the other's epoch is a four-year error, silently.
    const serial = [['Date', 'Description', 'Amount'], [44818, 'SYNTHETIC GROCER', -4.9]] as Cell[][];
    const plain = extractXls(ole(workbook([{name: 'Transactions', rows: serial}])))[1]![0];
    const epoch1904 = extractXls(ole(workbook([{name: 'Transactions', rows: serial}], {is1904: true})))[1]![0];
    expect(epoch1904).toBe('2026-09-15');
    expect(plain).not.toBe(epoch1904);
  });

  it('reads a workbook large enough to need its own sectors', () => {
    // Over the 4 KB cutoff the stream leaves the mini area and is chained through the main FAT, which
    // is the only path a real statement of any length takes.
    const many = [statement[0]!, ...Array.from({length: 300}, (_, i) =>
      ['2026-09-15', `SYNTHETIC MERCHANT ${i}`, -4.9, null, 190.21] as Cell[])];
    const file = ole(workbook([{name: 'Transactions', rows: many}]));
    expect(file.length).toBeGreaterThan(8192);
    const rows = extractXls(file);
    expect(rows).toHaveLength(301);
    expect(rows[300]![1]).toBe('SYNTHETIC MERCHANT 299');
  });

  it('reads a small workbook out of the mini stream', () => {
    // Anything under 4 KB is packed inside the root entry rather than the main sectors. A short export
    // is exactly the file a person tries first, so this path cannot be left untravelled.
    const file = ole(workbook([{name: 'Transactions', rows: statement}]), true);
    expect(extractXls(file)[1]![1]).toBe('SYNTHETIC GROCER');
  });

  it('refuses a formula instead of trusting a cached result', () => {
    // A stale formula result is a wrong number in a ledger, which is worse than a file that will not open.
    expect(() => extractXls(ole(workbook([
      {name: 'Transactions', rows: statement, inside: [record(0x0006, new Uint8Array(20))]},
    ])))).toThrow(/formula/i);
  });

  it('refuses compressed numbers rather than decode them wrongly', () => {
    // RK packs a number into four bytes with its own scaling rules. Banks do not emit it; a reader that
    // half-understood it would produce plausible wrong amounts.
    expect(() => extractXls(ole(workbook([
      {name: 'Transactions', rows: statement, inside: [record(0x027e, new Uint8Array(10))]},
    ])))).toThrow(/compressed numbers/i);
  });

  it('refuses a truncated file', () => {
    expect(() => extractXls(new Uint8Array(64))).toThrow(/truncated/i);
  });
});

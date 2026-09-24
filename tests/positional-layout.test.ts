import {describe, expect, it} from 'vitest';
import {positionalTable, type TextItem} from '../src/ingest/parse/positional';
import {ImportFailure} from '../src/ingest/types';
import {normalizeDate} from '../src/ingest/normalize';

/**
 * Layouts a positional statement can arrive in, as geometry rather than as a named bank.
 *
 * Every fixture here is invented. The shapes are real — a description printed above and below its own
 * amounts, an amount that drifts onto its own line, a fee written into a description, a page footer
 * sitting inside the column bounds — but no figure, merchant or balance came from anyone's statement.
 */
const COLUMN = {date: 42, description: 133, withdrawal: 344, deposit: 436, balance: 525};
const RIGHT = {withdrawal: 383, deposit: 463, balance: 554};
const wide = (text: string) => text.length * 4;

const at = (text: string, x: number, y: number, page = 1): TextItem => ({text, x, y, width: wide(text), page});
/** Money is printed right-aligned, so a fixture places it by the edge it ends on. */
const rightOf = (text: string, right: number, y: number, page = 1): TextItem => at(text, right - wide(text), y, page);

const header = (y: number, page = 1): TextItem[] => [
  at('Date', COLUMN.date, y, page), at('Description', COLUMN.description, y, page),
  at('Withdrawal', COLUMN.withdrawal, y, page), at('Deposit', COLUMN.deposit, y, page),
  at('Balance', COLUMN.balance, y, page),
];

describe('a statement that wraps its descriptions around the dated line', () => {
  const items: TextItem[] = [
    ...header(100),
    at('CARD PURCHASE SEVEN SEAS', COLUMN.description, 125),
    at('15 Sep 2026', COLUMN.date, 130), rightOf('-$12.50', RIGHT.withdrawal, 130), rightOf('$487.50', RIGHT.balance, 130),
    at('COFFEE 12/09', COLUMN.description, 135),
    at('TRANSFER FROM SAVINGS', COLUMN.description, 155),
    at('14 Sep 2026', COLUMN.date, 160), rightOf('$300.00', RIGHT.deposit, 160), rightOf('$500.00', RIGHT.balance, 160),
    at('REF 88213', COLUMN.description, 165),
  ];

  it('joins the line above and the line below into one description, in reading order', () => {
    const rows = positionalTable(items);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.description).toBe('CARD PURCHASE SEVEN SEAS COFFEE 12/09');
    expect(rows[1]!.description).toBe('TRANSFER FROM SAVINGS REF 88213');
  });

  it('keeps each wrapped line on its own transaction rather than the one before', () => {
    // The old reader folded a dateless line into the row before it, which put every lead-in line on the
    // previous transaction and left the very first one with nothing to attach to at all.
    expect(positionalTable(items)[1]!.description).not.toContain('SEVEN SEAS');
  });

  it('reads the direction from which money column the figure landed in', () => {
    const rows = positionalTable(items);
    expect(rows[0]!.direction).toBe('debit');
    expect(rows[1]!.direction).toBe('credit');
  });

  it('carries the running balance, which is what lets the import be checked against itself', () => {
    expect(positionalTable(items)[0]!.runningBalance).toBe('$487.50');
  });
});

describe('what it refuses to mistake for a transaction', () => {
  const base: TextItem[] = [
    ...header(100),
    at('CARD PURCHASE SEVEN SEAS', COLUMN.description, 125),
    at('15 Sep 2026', COLUMN.date, 130), rightOf('-$12.50', RIGHT.withdrawal, 130), rightOf('$487.50', RIGHT.balance, 130),
  ];

  it('drops a page footer that sits inside the column bounds', () => {
    // The copyright line starts a few points left of the Date column and lands in it. What rules it out
    // is that no money column holds a number — not where it sits on the page.
    const rows = positionalTable([...base,
      at('Copyright 2025 Example Bank', COLUMN.date - 6, 300),
      at('ABN 12 345 678 901', COLUMN.date - 6, 312)]);
    expect(rows).toHaveLength(1);
  });

  it('drops a page number even though it occupies two money columns', () => {
    const rows = positionalTable([...base,
      at('Date created', COLUMN.date - 6, 300), at('Page', COLUMN.deposit, 300), at('1 of 7', COLUMN.balance, 300)]);
    expect(rows).toHaveLength(1);
  });

  it('leaves a fee written into the description where it was printed', () => {
    // "$4.12" on its own line in the description column is the tail of a sentence about a foreign
    // transaction fee, not an amount. Reading it as one moved money onto an unrelated transaction.
    const rows = positionalTable([...base,
      at('USD 9.99 incl. Foreign Transaction Fee AUD', COLUMN.description, 135),
      at('$4.12', COLUMN.description, 140)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toContain('Fee AUD $4.12');
    expect(rows[0]!.amount).toBe('-$12.50');
  });
});

describe('amounts that do not sit where a fixed column would put them', () => {
  it('assigns a right-aligned figure by the edge it ends on, not the one it starts at', () => {
    // A five-figure balance begins further left than a three-figure one and starts inside the column
    // before it. Only its right edge says which column it belongs to.
    const rows = positionalTable([
      ...header(100),
      at('CARD PURCHASE SEVEN SEAS', COLUMN.description, 125),
      at('15 Sep 2026', COLUMN.date, 130), rightOf('-$12.50', RIGHT.withdrawal, 130), rightOf('$10,487.50', RIGHT.balance, 130),
    ]);
    expect(rows[0]!.runningBalance).toBe('$10,487.50');
    expect(rows[0]!.amount).toBe('-$12.50');
  });

  it('attaches an amount that drifted onto its own line to the nearest dated row', () => {
    const rows = positionalTable([
      ...header(100),
      at('CARD PURCHASE SEVEN SEAS', COLUMN.description, 125),
      at('15 Sep 2026', COLUMN.date, 130), rightOf('$487.50', RIGHT.balance, 130),
      rightOf('-$12.50', RIGHT.withdrawal, 134),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe('-$12.50');
    expect(rows[0]!.direction).toBe('debit');
  });

  it('will not let one transaction claim a second value for the same column', () => {
    expect(() => positionalTable([
      ...header(100),
      at('CARD PURCHASE SEVEN SEAS', COLUMN.description, 125),
      at('15 Sep 2026', COLUMN.date, 130), rightOf('-$12.50', RIGHT.withdrawal, 130), rightOf('$487.50', RIGHT.balance, 130),
      rightOf('-$99.00', RIGHT.withdrawal, 134),
    ])).toThrow(ImportFailure);
  });
});

describe('how far a stray line may reach', () => {
  it('does not let a description cross to the transaction after it', () => {
    // Reach is half the median gap between dated lines, taken from the page itself rather than tuned:
    // rows 40 apart accept a fragment within 20 and can never swallow the next row's lead-in.
    const rows = positionalTable([
      ...header(100),
      at('FIRST PURCHASE', COLUMN.description, 125),
      at('15 Sep 2026', COLUMN.date, 130), rightOf('-$12.50', RIGHT.withdrawal, 130), rightOf('$487.50', RIGHT.balance, 130),
      at('15 Sep 2026', COLUMN.date, 170), rightOf('-$20.00', RIGHT.withdrawal, 170), rightOf('$467.50', RIGHT.balance, 170),
      at('SECOND PURCHASE', COLUMN.description, 165),
    ]);
    expect(rows[0]!.description).toBe('FIRST PURCHASE');
    expect(rows[1]!.description).toBe('SECOND PURCHASE');
  });
});

describe('headers that repeat on every page', () => {
  it('re-anchors the columns under each page header and keeps every page', () => {
    const rows = positionalTable([
      ...header(100),
      at('FIRST PURCHASE', COLUMN.description, 125),
      at('15 Sep 2026', COLUMN.date, 130), rightOf('-$12.50', RIGHT.withdrawal, 130), rightOf('$487.50', RIGHT.balance, 130),
      ...header(40, 2),
      at('SECOND PURCHASE', COLUMN.description, 65, 2),
      at('14 Sep 2026', COLUMN.date, 70, 2), rightOf('-$20.00', RIGHT.withdrawal, 70, 2), rightOf('$467.50', RIGHT.balance, 70, 2),
    ]);
    expect(rows.map(r => r.description)).toEqual(['FIRST PURCHASE', 'SECOND PURCHASE']);
  });
});

describe('dates written with the month in words', () => {
  const period = {start: '2026-08-17', end: '2026-09-16'};

  it('reads them whichever way round the day and month are printed', () => {
    // A written month is the one date format with no ambiguity in it: "15 Sep 2026" and "Sep 15, 2026"
    // mean the same day to every reader, so neither needs the day/month order setting to be right.
    for (const written of ['15 Sep 2026', '15-Sep-2026', '15 September 2026', 'Sep 15, 2026', '15 Sept. 2026'])
      expect(normalizeDate(written, period, 'DMY')).toBe('2026-09-15');
    expect(normalizeDate('15 Sep 2026', period, 'MDY')).toBe('2026-09-15');
  });

  it('still reads the numeric forms, and still respects the day/month setting for them', () => {
    expect(normalizeDate('2026-09-15', period, 'DMY')).toBe('2026-09-15');
    expect(normalizeDate('09/09/2026', period, 'DMY')).toBe('2026-09-09');
    expect(normalizeDate('15/09/2026', period, 'DMY')).toBe('2026-09-15');
    expect(normalizeDate('09/15/2026', period, 'MDY')).toBe('2026-09-15');
  });

  it('refuses a month name it cannot place rather than guessing at one', () => {
    expect(() => normalizeDate('15 Smarch 2026', period, 'DMY')).toThrow(ImportFailure);
  });

  it('refuses a date outside the statement period, however it is written', () => {
    expect(() => normalizeDate('15 Jan 2026', period, 'DMY')).toThrow(ImportFailure);
  });
});

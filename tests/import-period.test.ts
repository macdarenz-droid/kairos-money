import {describe, expect, it} from 'vitest';
import {dateSpan, normalizeDate} from '../src/ingest/normalize';
import {parseExport} from '../src/ingest/sources/inference';
import {DateOutsidePeriod, PeriodTooNarrow, type ImportContext} from '../src/ingest/types';
import {MappingRequired} from '../src/ingest/sources/inference';

const period = {start: '2026-08-17', end: '2026-09-15'};
const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD',
  period, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};

describe('a date that fails the statement period', () => {
  /**
   * The message used to be "The date is ambiguous or outside the statement period. Confirm the
   * statement dates and date format." Two different problems with two different fixes, offered
   * together — so the reader checks the date format, which in this case was already right.
   */
  it('says which boundary it misses and which field to change', () => {
    let thrown: unknown;
    try { normalizeDate('2026-08-14', period, 'DMY'); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(DateOutsidePeriod);
    const failure = thrown as DateOutsidePeriod;
    expect(failure.date).toBe('2026-08-14');
    expect(failure.unreadable).toBe('2026-08-14 is before the statement start 2026-08-17.');
    expect(failure.action).toBe('Set the statement start on or before 2026-08-14.');
  });

  it('says the other boundary when the date is late', () => {
    let thrown: unknown;
    try { normalizeDate('2026-09-30', period, 'DMY'); } catch (e) { thrown = e; }
    expect((thrown as DateOutsidePeriod).unreadable).toBe('2026-09-30 is after the statement end 2026-09-15.');
    expect((thrown as DateOutsidePeriod).action).toBe('Set the statement end on or after 2026-09-30.');
  });

  /**
   * A date that really does read two ways inside the window is the one case the FORMAT can fix.
   *
   * It takes a window spanning two years to produce one: within a single year the day/month setting
   * already decides, so a bare "03/04" has exactly one reading and is not ambiguous at all.
   */
  it('keeps the format message for a date that reads as two days inside the window', () => {
    let thrown: unknown;
    try { normalizeDate('03/04', {start: '2025-01-01', end: '2026-12-31'}, 'DMY'); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DateOutsidePeriod);
    expect((thrown as Error & {action: string}).action).toBe('Set the date format to day/month or month/day.');
  });

  it('still reads an unambiguous date inside the window', () => {
    expect(normalizeDate('2026-09-01', period, 'DMY')).toBe('2026-09-01');
    expect(normalizeDate('01/09/2026', period, 'DMY')).toBe('2026-09-01');
  });

  /** The window is what disambiguates 03/04, so it is still applied — this must not have been lost. */
  it('still uses the period to choose between two readings', () => {
    expect(normalizeDate('03/04/2026', {start: '2026-04-01', end: '2026-04-30'}, 'DMY')).toBe('2026-04-03');
    expect(normalizeDate('03/04/2026', {start: '2026-03-01', end: '2026-03-31'}, 'MDY')).toBe('2026-03-04');
  });
});

describe('the span a file actually covers', () => {
  it('reports its first and last date', () => {
    expect(dateSpan(['2026-06-18', '2026-09-15', '2026-07-02'], period, 'DMY'))
      .toEqual({start: '2026-06-18', end: '2026-09-15'});
  });

  /** Offering the wrong dates is worse than offering none, so an unreadable column gives up. */
  it('gives up rather than guess when a value cannot be read', () => {
    expect(dateSpan(['2026-06-18', 'not a date'], period, 'DMY')).toBeNull();
  });

  it('gives up when a bare day and month could be several years', () => {
    expect(dateSpan(['03/04'], period, 'DMY')).toBeNull();
  });

  it('has nothing to say about no rows at all', () => {
    expect(dateSpan([], period, 'DMY')).toBeNull();
  });
});

describe('an export whose rows fall outside the declared period', () => {
  const table = [
    ['Date', 'Description', 'Amount'],
    ['2026-06-18', 'Synthetic payee', '-12.00'],
    ['2026-07-02', 'Synthetic payee', '-8.00'],
    ['2026-09-15', 'Synthetic payee', '-4.90'],
  ];

  /**
   * This is what he hit. The old failure said "Dates do not match the supplied export range. Assign
   * the columns and date format below" — pointing at a column mapping that was never wrong, and naming
   * at most one offending row, so fixing it only revealed the next one.
   */
  it('names the file’s whole span, not the first row that failed', () => {
    let thrown: unknown;
    try { parseExport(table, context); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(PeriodTooNarrow);
    const failure = thrown as PeriodTooNarrow;
    expect(failure.span).toEqual({start: '2026-06-18', end: '2026-09-15'});
    expect(failure.unreadable).toBe('This file covers 2026-06-18 to 2026-09-15.');
    expect(failure.action).toBe('The statement period set here leaves part of it out.');
  });

  it('parses once the period covers it', () => {
    const covering = {...context, period: {start: '2026-06-18', end: '2026-09-15'}};
    expect(parseExport(table, covering).rows).toHaveLength(3);
  });

  /** A file that genuinely needs its columns assigned must still say so, not blame the dates. */
  it('still asks for a mapping when the columns are the problem', () => {
    const unmappable = [
      ['2026-09-01', '2026-09-02'],
      ['2026-09-03', '2026-09-04'],
    ];
    const covering = {...context, period: {start: '2026-08-17', end: '2026-09-15'}};
    expect(() => parseExport(unmappable, covering)).toThrow(MappingRequired);
  });
});

describe('a saved column mapping', () => {
  const table = [['Date', 'Description', 'Amount'], ['2026-06-18', 'Synthetic payee', '-12.00'], ['2026-09-15', 'Synthetic payee', '-4.90']];
  it('still checks the rows against the statement period', () => {
    const saved = parseExport(table, {...context, period: {start: '2026-06-18', end: '2026-09-15'}}).mapping;
    let thrown: unknown;
    try { parseExport(table, context, saved); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(PeriodTooNarrow);
    expect((thrown as PeriodTooNarrow).span).toEqual({start: '2026-06-18', end: '2026-09-15'});
    expect(parseExport(table, {...context, period: {start: '2026-06-01', end: '2026-09-30'}}, saved).rows).toHaveLength(2);
  });
});

import {describe, expect, it} from 'vitest';
import {MAX_RATE_MONTHS, rateDays} from '../src/core/fx';

/**
 * A refresh asked for `latest` alone, so nothing older than the tap could be converted and most of a
 * ledger simply disappeared from the analysis. These are the days one refresh asks for instead.
 */
describe('the days a refresh asks the rate source for', () => {
  it('covers every month the ledger spans, from its first', () => {
    expect(rateDays('2026-01-14', '2026-04-02'))
      .toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
  });

  /** A purchase on the 3rd needs a rate published on or before the 3rd; the 1st is on or before it. */
  it('starts the month before the earliest purchase in it, never after', () => {
    expect(rateDays('2026-03-31', '2026-03-31')).toEqual(['2026-03-01']);
  });

  it('crosses a year boundary', () => {
    expect(rateDays('2025-11-20', '2026-02-05'))
      .toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });

  /** One tap must not become hundreds of requests; the oldest months are given up, not the newest. */
  it('keeps the most recent months when a ledger runs longer than the cap', () => {
    const days = rateDays('2000-01-01', '2026-09-17');
    expect(days).toHaveLength(MAX_RATE_MONTHS);
    expect(days.at(-1)).toBe('2026-09-01');
    expect(days[0]! > '2000-01-01').toBe(true);
  });

  it('asks for nothing when there is nothing to convert', () => {
    expect(rateDays('', '')).toEqual([]);
    expect(rateDays('2026-04-01', '2026-01-01')).toEqual([]);
  });
});

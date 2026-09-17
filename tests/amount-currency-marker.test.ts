import { describe, expect, it } from 'vitest';
import { normalizeAmount } from '../src/ingest/normalize';

/**
 * A currency marker sits on either side of the figure depending on who wrote the file. "PHP 1,200.00"
 * and "1,200.00 PHP" are both ordinary export formats; only the leading one used to be stripped, so the
 * trailing form was refused with an unreadable-fraction error. Loud rather than wrong, but it still
 * turned away a perfectly good file.
 *
 * These live in their own file because tests/ingest.test.ts is a frozen Session 2 acceptance file,
 * hash-pinned by docs/SESSION_2_BASELINE.json. New coverage goes beside it, never inside it.
 */
describe('a currency marker on either side of the amount', () => {
  const PHP = 'PHP' as const;
  for (const [written, minor] of [
    ['₱1,200.00', 120000n],
    ['PHP 1,200.00', 120000n],
    ['Php 1,200.00', 120000n],   // Case is the bank's business; the reader uppercases before matching.
    ['1,200.00 PHP', 120000n],
    ['1200 PHP', 120000n],
    ['₱1,200.00 CR', 120000n],
    ['₱1,200.00 DR', -120000n],
  ] as const) {
    it(`reads ${written}`, () => expect(normalizeAmount(written, PHP, '.')).toBe(minor));
  }

  it('still refuses a figure it cannot read exactly', () => {
    // Stripping a known marker off each end must not become stripping anything off each end. A stray
    // word is a reason to stop and ask, not to guess at the number inside it.
    for (const bad of ['1,200.00 pesos', 'about 1,200.00', '1,200.00 PHP USD', '1,2 00.00 PHP'])
      expect(() => normalizeAmount(bad, PHP, '.'), bad).toThrow();
  });

  it('leaves the currencies it does not know alone', () => {
    // The marker list is explicit. An unknown code must fail rather than be silently shaved off.
    expect(() => normalizeAmount('1,200.00 XYZ', PHP, '.')).toThrow();
  });
});

import {describe, expect, it} from 'vitest';
import {currencyExposure, sharePercent} from '../src/intelligence/visuals/exposure';

describe('how much of the money is in which currency', () => {
  /** One currency means "all of it", and a bar that is a hundred per cent one thing says nothing. */
  it('is not drawn when only one currency is held', () => {
    expect(currencyExposure([{code: 'AUD', minor: '500000'}])).toBeNull();
    expect(currencyExposure([{code: 'AUD', minor: '300000'}, {code: 'AUD', minor: '200000'}])).toBeNull();
  });

  it('is not drawn when there is nothing to hold', () => {
    expect(currencyExposure([{code: 'AUD', minor: '0'}, {code: 'PHP', minor: '0'}])).toBeNull();
  });

  /** Largest first: the exposure worth knowing about is the one most of the money is in. */
  it('orders by magnitude and gives each its share of the whole', () => {
    const exposure = currencyExposure([{code: 'PHP', minor: '250000'}, {code: 'AUD', minor: '750000'}])!;
    expect(exposure.totalMinor).toBe('1000000');
    expect(exposure.bands.map(b => b.code)).toEqual(['AUD', 'PHP']);
    expect(exposure.bands.map(b => b.share)).toEqual(['750000', '250000']);
    // Stacked by the model, so the view divides nothing and adds nothing up.
    expect(exposure.bands.map(b => b.left)).toEqual(['0', '750000']);
    expect(exposure.bands.map(b => b.rank)).toEqual([0, 1]);
  });

  /** Two accounts in the same currency are one exposure, not two. */
  it('adds up the accounts that share a currency', () => {
    const exposure = currencyExposure([
      {code: 'AUD', minor: '100000'}, {code: 'PHP', minor: '400000'}, {code: 'AUD', minor: '500000'}])!;
    expect(exposure.bands.map(b => [b.code, b.minor])).toEqual([['AUD', '600000'], ['PHP', '400000']]);
  });

  /**
   * A card denominated in a currency he owes on is a liability in that currency. A negative share of a
   * bar that sums to a hundred per cent has no meaning, so it is named instead of netted away.
   */
  it('names a currency held at a net loss rather than folding it into the shares', () => {
    const exposure = currencyExposure([
      {code: 'AUD', minor: '600000'}, {code: 'PHP', minor: '400000'}, {code: 'USD', minor: '-120000'}])!;
    expect(exposure.bands.map(b => b.code)).toEqual(['AUD', 'PHP']);
    expect(exposure.totalMinor).toBe('1000000');
    expect(exposure.owed).toEqual([{code: 'USD', minor: '120000'}]);
  });

  /** Nothing to compare: one currency held and one owed is not a mix of holdings. */
  it('is not drawn when only one currency is actually held', () => {
    expect(currencyExposure([{code: 'AUD', minor: '600000'}, {code: 'USD', minor: '-120000'}])).toBeNull();
  });

  /** Equal holdings keep a fixed order, so the bar does not reshuffle itself between openings. */
  it('breaks a tie by code', () => {
    const exposure = currencyExposure([{code: 'PHP', minor: '500000'}, {code: 'AUD', minor: '500000'}])!;
    expect(exposure.bands.map(b => b.code)).toEqual(['AUD', 'PHP']);
  });

  it('rounds a share to whole percent rather than truncating it', () => {
    expect(sharePercent('750000')).toBe('75%');
    expect(sharePercent('125000')).toBe('13%');
    expect(sharePercent('4000')).toBe('0%');
  });
});

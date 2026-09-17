import {displayRatio} from './index';

/**
 * HOW MUCH OF THE MONEY IS IN WHICH CURRENCY.
 *
 * Shown only when more than one currency is actually held. With one currency the answer is "all of it",
 * and a bar that is one hundred per cent one thing is a decoration, not a finding.
 *
 * WHAT THIS IS FOR. Someone paid in one currency and spending in another is exposed to the rate between
 * them: the same balance buys more or less next month without a single transaction. That risk is a
 * SHARE, not a total, so the chart is a share — one bar, read left to right, largest first.
 *
 * ONE HUE, ORDERED BY MAGNITUDE. A currency is not a category with a personality; the code is its
 * identity and it is printed. Shade repeats size so a narrow slice can be placed on the scale without
 * measuring it against its neighbour.
 *
 * A NET-NEGATIVE CURRENCY IS NOT A SLICE. A card denominated in a currency he owes on is a liability in
 * that currency, and a negative share of a bar that sums to one hundred per cent has no meaning. Those
 * are named and totalled separately rather than folded in, netted off, or dropped.
 */
export type ExposureBand = {
  code: string;
  /** Converted into the display currency, so the shares are comparable at all. */
  minor: string;
  /** Millionths of the total held. The screen divides nothing. */
  share: string;
  /** Left edge in millionths, so the bar stacks without the view adding anything up. */
  left: string;
  /** 0 is the largest. Drives shade only, never identity. */
  rank: number;
};

export type CurrencyExposure = {
  totalMinor: string;
  bands: ExposureBand[];
  /** Currencies held at a net loss, named rather than netted away. */
  owed: {code: string; minor: string}[];
};

export type Holding = {code: string; minor: string};

/**
 * @param holdings one entry per currency, already converted into the display currency
 *
 * Returns null when fewer than two currencies are held, or when nothing is held at all.
 */
export function currencyExposure(holdings: readonly Holding[]): CurrencyExposure | null {
  const merged = new Map<string, bigint>();
  for (const holding of holdings) merged.set(holding.code, (merged.get(holding.code) ?? 0n) + BigInt(holding.minor));
  if (merged.size < 2) return null;

  const owed = [...merged].filter(([, minor]) => minor < 0n)
    .map(([code, minor]) => ({code, minor: (-minor).toString()}))
    .sort((a, b) => (BigInt(b.minor) > BigInt(a.minor) ? 1 : BigInt(b.minor) < BigInt(a.minor) ? -1 : a.code.localeCompare(b.code)));

  // Largest first, then by code, so two equal holdings never swap places between openings.
  const held = [...merged].filter(([, minor]) => minor > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0].localeCompare(b[0])));
  const total = held.reduce((sum, [, minor]) => sum + minor, 0n);
  if (held.length < 2 || total <= 0n) return null;

  const bands: ExposureBand[] = [];
  let running = 0n;
  for (const [rank, [code, minor]] of held.entries()) {
    const left = displayRatio(running.toString(), total.toString());
    running += minor;
    const right = displayRatio(running.toString(), total.toString());
    bands.push({code, minor: minor.toString(), left, share: (BigInt(right) - BigInt(left)).toString(), rank});
  }
  return {totalMinor: total.toString(), bands, owed};
}

/** A share as whole percent, for a label beside the code. Millionths in, never a float. */
export function sharePercent(share: string): string {
  return `${(BigInt(share) + 5000n) / 10000n}%`;
}

import {displayRatio} from './index';

/**
 * WHAT CAME IN, WHAT WENT OUT, AND THE GAP BETWEEN THEM.
 *
 * WHY THIS IS NOT DRAWN AS CROSSING RIBBONS. A Sankey earns its shape from many-to-many links — this
 * supplier fed that process, which fed those three others. Money has no such links. It is fungible: once
 * a salary and a refund are in the same account, nothing on earth can say which of them paid the rent.
 * Drawing a ribbon from "Salary" to "Groceries" would be inventing a fact the ledger does not hold, and
 * inventing facts is the one thing this app never does.
 *
 * So the flow has ONE junction, which is the truth: everything in goes to one pool, and the pool pays
 * everything out. What that leaves is two stacks facing each other at the SAME SCALE, joined by a single
 * band — and the band's taper is the headline. It narrows when less went out than came in and swells
 * when more did, and that one shape is the question a month of money actually asks.
 *
 * ONE HUE, ORDERED BY MAGNITUDE. Bands are never coloured by what they are; a category's identity comes
 * from its label. Shade repeats size, which is redundant on purpose — a thin band is easier to place on
 * the scale by its shade than by measuring it against a neighbour.
 */
export type FlowBand = {
  id: string;
  label: string;
  minor: string;
  /** Top edge and height, in millionths of the larger side. The screen divides nothing. */
  top: string;
  height: string;
  /** 0 is the largest band on its side. Drives shade only, never identity. */
  rank: number;
};

export type MoneyFlow = {
  totalInMinor: string;
  totalOutMinor: string;
  /** In minus out. Negative means more went out than came in. */
  leftoverMinor: string;
  sources: FlowBand[];
  destinations: FlowBand[];
  /** Height of each side as millionths, so the connecting band can taper between them. */
  inHeight: string;
  outHeight: string;
};

/** Beyond this many bands a side becomes stripes nobody can read, so the tail is gathered. */
export const MAX_BANDS = 6;
/** The gathered tail is named rather than hidden; a chart that quietly drops money is a lie. */
export const OTHER = 'Other';
export const LEFTOVER = 'Left over';

export type Amount = {id: string; label: string; minor: string};

/**
 * Largest first, then by label so two equal amounts never swap places between openings. Everything past
 * MAX_BANDS is summed into one named band rather than dropped.
 */
function gather(amounts: readonly Amount[]): Amount[] {
  const positive = amounts.filter(a => BigInt(a.minor) > 0n);
  const sorted = [...positive].sort((a, b) =>
    BigInt(b.minor) > BigInt(a.minor) ? 1 : BigInt(b.minor) < BigInt(a.minor) ? -1 : a.label.localeCompare(b.label));
  if (sorted.length <= MAX_BANDS) return sorted;
  const kept = sorted.slice(0, MAX_BANDS - 1);
  const rest = sorted.slice(MAX_BANDS - 1).reduce((total, a) => total + BigInt(a.minor), 0n);
  return [...kept, {id: 'other', label: OTHER, minor: rest.toString()}];
}

function stack(amounts: readonly Amount[], scaleMinor: bigint): FlowBand[] {
  const out: FlowBand[] = [];
  let running = 0n;
  for (const [rank, amount] of amounts.entries()) {
    const top = displayRatio(running.toString(), scaleMinor.toString());
    running += BigInt(amount.minor);
    const bottom = displayRatio(running.toString(), scaleMinor.toString());
    out.push({id: amount.id, label: amount.label, minor: amount.minor, rank,
      top, height: (BigInt(bottom) - BigInt(top)).toString()});
  }
  return out;
}

/**
 * @param income what arrived, by source
 * @param spending what left, by category
 *
 * Returns null when there is nothing on either side. An empty flow diagram is not a picture of a quiet
 * month; it is a picture of nothing, and it belongs off the screen.
 */
export function moneyFlow(income: readonly Amount[], spending: readonly Amount[]): MoneyFlow | null {
  const totalIn = income.reduce((total, a) => total + (BigInt(a.minor) > 0n ? BigInt(a.minor) : 0n), 0n);
  const totalOut = spending.reduce((total, a) => total + (BigInt(a.minor) > 0n ? BigInt(a.minor) : 0n), 0n);
  if (totalIn <= 0n && totalOut <= 0n) return null;
  const leftover = totalIn - totalOut;

  // BOTH SIDES SHARE ONE SCALE. Scaling each to its own height would make a month that spent twice its
  // income look identical to one that spent half — the comparison IS the chart.
  const scale = totalIn > totalOut ? totalIn : totalOut;

  // What is left is drawn on the spending side, because it is where the money ended up — but ALWAYS
  // LAST, and never inside the sort. Ranked by size among the categories it reads as another thing you
  // spent on, which it is precisely not; and counted against MAX_BANDS it pushes a real category into
  // "Other", so a month with something left over would show less of where the money actually went.
  //
  // An overspend gets no band at all: the out stack is simply taller than the in stack, which is the
  // picture, and "Left over: -400" would be a sentence pretending to be a quantity.
  const destinations = [...gather(spending),
    ...(leftover > 0n ? [{id: 'leftover', label: LEFTOVER, minor: leftover.toString()}] : [])];

  return {
    totalInMinor: totalIn.toString(), totalOutMinor: totalOut.toString(), leftoverMinor: leftover.toString(),
    sources: stack(gather(income), scale), destinations: stack(destinations, scale),
    inHeight: displayRatio(totalIn.toString(), scale.toString()),
    outHeight: displayRatio((totalOut + (leftover > 0n ? leftover : 0n)).toString(), scale.toString()),
  };
}

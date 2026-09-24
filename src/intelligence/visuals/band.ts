import {day, iso, type Snapshot} from '../model';

/**
 * Thirty days is the block, and six blocks is the history.
 *
 * Calendar months are the obvious choice and they are the wrong one, for a reason that shows up on the
 * third of every month: comparing a three-day month against a thirty-one-day one reports spending down
 * ninety per cent, which is not a finding, it is the calendar. Equal blocks are always like-for-like, so
 * the comparison is sound on every day of the year and needs no caveat under it.
 */
export const BLOCK_DAYS = 30;
export const BLOCKS = 6;

export type BandBlock = {
  start: string; end: string;
  inMinor: string; outMinor: string; netMinor: string;
  ids: string[]; unconfirmed: boolean;
};

export type MoneyBand = {
  start: string; end: string;
  blocks: BandBlock[];
  now: BandBlock;
  before: BandBlock;
  /** The previous block saw movement, so a change against it means something. */
  comparable: boolean;
  /** Enough blocks have movement for a shape to be worth drawing. */
  trend: boolean;
};

/**
 * What counts as money arriving or leaving.
 *
 * Deliberately NOT the historical() filter the signals use, and the difference is the whole point.
 * historical() requires covered(), meaning every account has an imported statement spanning that day —
 * correct for a claim about a trend, and ruinous here, because someone who records by hand or approves
 * notifications has no statement coverage at all and would watch this band read zero forever while his
 * ledger filled up. That is the same mistake as showing him an opening balance and calling it his balance.
 *
 * So coverage does not gate it, and neither does settlement: an approved notification is written pending,
 * because a bank's push is an authorisation rather than a settled row, but the money still left. It counts
 * here and the band says when some of it is unconfirmed. What confirmation changes is how much the app
 * trusts a row, not whether the money moved — which is why the thirty-six measures still exclude pending
 * and this does not.
 *
 * Transfers are excluded in both, and for the same reason in both: moving your own money between your own
 * accounts is neither income nor spending, and counting it would invent both.
 */
export function bandRows(snapshot: Snapshot) {
  return snapshot.transactions.filter(row =>
    row.currency === snapshot.currency &&
    snapshot.accountIds.includes(row.accountId) &&
    !row.transfer && row.kind !== 'transfer');
}

export function moneyBand(snapshot: Snapshot, today: string): MoneyBand {
  const rows = bandRows(snapshot);
  // Anchored to the last day the ledger knows about rather than to today, so statements that end in June
  // still draw a band in September instead of six empty blocks. Never past today: a future-dated row must
  // not drag the window forward into days nothing can have happened in yet.
  const latest = rows.map(row => row.date).filter(date => date <= today).sort().at(-1) ?? today;
  const anchor = day(latest);

  const build = (from: number, to: number): BandBlock => {
    const start = iso(from), end = iso(to);
    let received = 0n, spent = 0n, unconfirmed = false;
    const ids: string[] = [];
    for (const row of rows) {
      if (row.date < start || row.date > end) continue;
      const value = BigInt(row.minor);
      if (value >= 0n) received += value; else spent -= value;
      if (row.status === 'pending') unconfirmed = true;
      ids.push(row.id);
    }
    return {start, end, inMinor: received.toString(), outMinor: spent.toString(),
      netMinor: (received - spent).toString(), ids: ids.sort(), unconfirmed};
  };

  const blocks = Array.from({length: BLOCKS}, (_, index) => {
    const end = anchor - (BLOCKS - 1 - index) * BLOCK_DAYS;
    return build(end - BLOCK_DAYS + 1, end);
  });

  const moved = (block: BandBlock) => BigInt(block.inMinor) + BigInt(block.outMinor) > 0n;
  const now = blocks[BLOCKS - 1]!, before = blocks[BLOCKS - 2]!;
  return {start: blocks[0]!.start, end: now.end, blocks, now, before,
    comparable: moved(before), trend: blocks.filter(moved).length >= 3};
}

/**
 * Whole per cent, as a string, computed in integers.
 *
 * Null rather than zero when nothing came before: a change from nothing is not a hundred per cent rise or
 * any other number, and printing one would be the app inventing a trend out of its own first month.
 */
export function changePercent(now: string, before: string): string | null {
  const base = BigInt(before);
  if (base <= 0n) return null;
  return ((BigInt(now) - base) * 100n / base).toString();
}

import type {ReadableNotice} from './index';

/** One movement to put to the owner: a single purchase, or two notices that are one transfer. */
export type NoticeItem =
  | {kind: 'single'; item: ReadableNotice; accountId: string}
  | {kind: 'transfer'; out: ReadableNotice; in: ReadableNotice; fromId: string; toId: string};

/** Both banks announce the same movement within moments of each other, not days. */
const WINDOW_MS = 30 * 60 * 1000;

/**
 * Two notifications that are one transfer between the owner's own accounts, joined before anything is
 * recorded.
 *
 * Moving $3 from one bank to another produces two notices — "you sent $3" from the first and "you've been
 * paid $3" from the second — and recorded separately they become a purchase and an income on whichever
 * account was selected. That is wrong twice over: it invents spending that never happened, and it leaves
 * both real balances wrong while the two rows net to zero and look fine.
 *
 * A pair is only joined when every part of the claim holds: opposite directions, the same exact amount to
 * the minor unit, two DIFFERENT accounts of the owner's, and close enough in time that they describe one
 * movement. Anything short of that stays two separate rows for the owner to answer, because a wrongly
 * joined pair hides a real purchase.
 *
 * Amounts are compared as exact strings of minor units, never as numbers.
 */
export function pairNotices(
  readable: readonly ReadableNotice[],
  accountOf: (item: ReadableNotice) => string,
): NoticeItem[] {
  const ordered = [...readable].sort((a, b) => a.notice.postedAt - b.notice.postedAt);
  const taken = new Set<string>();
  const items: NoticeItem[] = [];

  for (const item of ordered) {
    if (taken.has(item.notice.id)) continue;
    const outward = BigInt(item.minor) < 0n;
    const size = outward ? (-BigInt(item.minor)).toString() : item.minor;
    const here = accountOf(item);

    const mate = ordered.find(other => {
      if (other.notice.id === item.notice.id || taken.has(other.notice.id)) return false;
      if (BigInt(other.minor) < 0n === outward) return false;          // Same direction: not a transfer.
      if (other.currency !== item.currency) return false;               // Two currencies is not one movement.
      const otherSize = BigInt(other.minor) < 0n ? (-BigInt(other.minor)).toString() : other.minor;
      if (otherSize !== size) return false;
      if (accountOf(other) === here) return false;                     // One account cannot pay itself.
      return Math.abs(other.notice.postedAt - item.notice.postedAt) <= WINDOW_MS;
    });

    if (!mate) { items.push({kind: 'single', item, accountId: here}); continue; }
    taken.add(item.notice.id); taken.add(mate.notice.id);
    const [out, inward] = outward ? [item, mate] : [mate, item];
    items.push({kind: 'transfer', out, in: inward, fromId: accountOf(out), toId: accountOf(inward)});
  }
  return items;
}

import {describe, expect, it} from 'vitest';
import {accountFromNotice} from '../src/ingest/notices/route';
import {pairNotices} from '../src/ingest/notices/pair';
import type {ReadableNotice} from '../src/ingest/notices';
import {currency} from '../src/core/money';

const AUD = currency('AUD');
const accounts = [
  {id: 'commbank', mask_last4: '0189'},
  {id: 'trial', mask_last4: '6522'},
];

describe('which account a notification is about', () => {
  it('reads the tail a bank prints, even when it prints fewer digits than are stored', () => {
    // Verbatim from the owner's phone. CommBank prints three digits; the account stores four.
    expect(accountFromNotice("CommBank You've been paid $3.00 into your account ending 189", accounts)).toBe('commbank');
    expect(accountFromNotice('Purchase of $43.20 on card ending 6522', accounts)).toBe('trial');
    expect(accountFromNotice('Debit from acct ••6522', accounts)).toBe('trial');
  });

  it('never routes money by a number that is not an account', () => {
    // Also verbatim. 1826645 is a payment reference, and $3.00 is an amount; neither identifies anybody.
    expect(accountFromNotice('WITHDRAWAL-OSKO PAYMENT 1826645 for $3.00', accounts)).toBeNull();
    expect(accountFromNotice('You spent $189.00 at WOOLWORTHS 1234', accounts)).toBeNull();
  });

  it('refuses an answer when the digits fit more than one account', () => {
    const clashing = [{id: 'a', mask_last4: '4189'}, {id: 'b', mask_last4: '0189'}];
    expect(accountFromNotice('paid into your account ending 189', clashing)).toBeNull();
  });

  it('says nothing when no account has a recorded tail to match', () => {
    expect(accountFromNotice('account ending 189', [{id: 'commbank', mask_last4: null}])).toBeNull();
  });
});

const notice = (id: string, minor: string, postedAt: number): ReadableNotice => ({
  notice: {id, source: 'org.bank', title: id, text: id, postedAt},
  status: 'ok', minor, currency: AUD, merchant: id, date: '2026-09-15', description: id,
});

describe('two notifications that are one transfer', () => {
  const route = (map: Record<string, string>) => (item: ReadableNotice) => map[item.notice.id]!;

  it('joins the pair the owner actually saw, instead of a purchase and an income', () => {
    const items = pairNotices(
      [notice('out', '-300', 1_000_000), notice('in', '300', 1_060_000)],
      route({out: 'commbank', in: 'trial'}),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({kind: 'transfer', fromId: 'commbank', toId: 'trial'});
  });

  it('leaves them separate when anything about the claim does not hold', () => {
    const apart = (a: ReadableNotice[], map: Record<string, string>) => pairNotices(a, route(map)).map(i => i.kind);
    // Different accounts but different amounts.
    expect(apart([notice('out', '-300', 0), notice('in', '500', 60_000)], {out: 'a', in: 'b'})).toEqual(['single', 'single']);
    // Same amount and opposite directions, but the same account: one account cannot pay itself.
    expect(apart([notice('out', '-300', 0), notice('in', '300', 60_000)], {out: 'a', in: 'a'})).toEqual(['single', 'single']);
    // Same amount, different accounts, but hours apart: two movements that happen to match.
    expect(apart([notice('out', '-300', 0), notice('in', '300', 4 * 3600_000)], {out: 'a', in: 'b'})).toEqual(['single', 'single']);
    // Both outward: two purchases, not a transfer.
    expect(apart([notice('out', '-300', 0), notice('two', '-300', 60_000)], {out: 'a', two: 'b'})).toEqual(['single', 'single']);
  });

  it('pairs each notice at most once, so a third of the same size stays on its own', () => {
    const items = pairNotices(
      [notice('out', '-300', 0), notice('in', '300', 30_000), notice('spare', '300', 60_000)],
      route({out: 'a', in: 'b', spare: 'c'}),
    );
    expect(items.map(i => i.kind)).toEqual(['transfer', 'single']);
  });
});

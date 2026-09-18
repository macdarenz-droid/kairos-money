import {describe, expect, it} from 'vitest';
import {accountFromNotice, routeNotices} from '../src/ingest/notices/route';
import {pairNotices} from '../src/ingest/notices/pair';
import type {Notice, ReadableNotice} from '../src/ingest/notices';
import {currency} from '../src/core/money';

const AUD = currency('AUD');
const accounts = [
  {id: 'commbank', mask_last4: '0407'},
  {id: 'trial', mask_last4: '3318'},
];

describe('which account a notification is about', () => {
  it('reads the tail a bank prints, even when it prints fewer digits than are stored', () => {
    // A real notification shape with synthetic digits. CommBank prints three; the account stores four.
    expect(accountFromNotice("CommBank You've been paid $3.00 into your account ending 407", accounts)).toBe('commbank');
    expect(accountFromNotice('Purchase of $43.20 on card ending 3318', accounts)).toBe('trial');
    expect(accountFromNotice('Debit from acct ••3318', accounts)).toBe('trial');
  });

  it('never routes money by a number that is not an account', () => {
    // Also a real shape, synthetic digits. 4471902 is a payment reference and $3.00 an amount; a router
    // that treated either as an account tail would post money to the wrong place.
    expect(accountFromNotice('WITHDRAWAL-OSKO PAYMENT 4471902 for $3.00', accounts)).toBeNull();
    expect(accountFromNotice('You spent $407.00 at WOOLWORTHS 1234', accounts)).toBeNull();
  });

  it('refuses an answer when the digits fit more than one account', () => {
    const clashing = [{id: 'a', mask_last4: '4407'}, {id: 'b', mask_last4: '0407'}];
    expect(accountFromNotice('paid into your account ending 407', clashing)).toBeNull();
  });

  it('says nothing when no account has a recorded tail to match', () => {
    expect(accountFromNotice('account ending 407', [{id: 'commbank', mask_last4: null}])).toBeNull();
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

describe('where a notification lands, decided once for the sheet and the shade', () => {
  const at = Date.parse('2026-09-18T01:15:00Z');
  const say = (id: string, text: string): Notice => ({id, source: 'app.synthetic', title: 'Synthetic', text, postedAt: at});
  const his = [
    {id: 'anz', currency: 'AUD', mask_last4: '0407', archived_at: null},
    {id: 'wallet', currency: 'PHP', mask_last4: null, archived_at: null},
    {id: 'old', currency: 'PHP', mask_last4: null, archived_at: '2026-01-01T00:00:00Z'},
  ];

  it('reads a peso receipt on the peso wallet when the dollar bank sorts first', () => {
    const {readable, unreadable} = routeNotices([say('in', 'You have received PHP 500.00 from JUAN D. Your new balance is PHP 1,500.00.')], his, null);
    expect(unreadable).toEqual([]);
    expect(readable[0]).toMatchObject({accountId: 'wallet', minor: '50000', currency: 'PHP'});
  });

  it('reads a bare-symbol notice in the main account\'s currency, and lands it there', () => {
    const {readable} = routeNotices([say('b', 'You spent $8.00 at CAFE MIKA.')], his, 'wallet');
    expect(readable[0]).toMatchObject({accountId: 'wallet', minor: '-800', currency: 'PHP'});
    expect(routeNotices([say('b', 'You spent $8.00 at CAFE MIKA.')], his, null).readable[0]).toMatchObject({accountId: 'anz', currency: 'AUD'});
  });

  it('lets the account the bank names win, and does not re-route a notice that disagrees with it', () => {
    expect(routeNotices([say('n', 'You spent $8.00 on card ending 407.')], his, 'wallet').readable[0]).toMatchObject({accountId: 'anz'});
    const {readable, unreadable} = routeNotices([say('n', 'PHP 300.00 was debited from your account ending 407.')], his, 'wallet');
    expect(readable).toEqual([]);
    expect(unreadable[0]?.reason).toBe('The notification is in PHP, not AUD.');
  });

  it('never lands money on an archived account, and says so when there is nowhere to land it', () => {
    expect(routeNotices([say('in', 'You have received PHP 500.00 from JUAN D.')], his, 'old').readable[0]?.accountId).toBe('wallet');
    const {unreadable} = routeNotices([say('in', 'You have received PHP 500.00 from JUAN D.')], [his[2]!], null);
    expect(unreadable[0]?.reason).toBe('There is no active account to record this on.');
  });

  it('gives the reason from the account the owner would have expected it on', () => {
    const {unreadable} = routeNotices([say('x', 'You have received EUR 20.00 from a friend.')], his, 'wallet');
    expect(unreadable[0]?.reason).toBe('The notification is in EUR, not PHP.');
  });
});

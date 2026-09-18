import {expect, it} from 'vitest';
import {applyShadeDecisions, shadeBatch} from '../src/ui/notices';
import type {Notice} from '../src/ingest/notices';
import {localDay} from '../src/ingest/reminders';

/** One bank account, as it was when the shade path was written. */
const ONE = [{id: 'a', currency: 'AUD', mask_last4: null, archived_at: null}];
const at = Date.parse('2026-08-26T04:15:00Z');
const notice = (over: Partial<Notice> = {}): Notice => ({id: 'n1', source: 'app.bank', title: 'Synthetic Bank',
  text: 'You spent $12.50 at WOOLWORTHS 1234.', postedAt: at, decision: null, ...over});

function collect() {
  const approved: unknown[] = [], forgotten: string[] = [];
  return {approved, forgotten,
    approve: (r: unknown) => { approved.push(r); return Promise.resolve(r); },
    forget: (ids: string[]) => { forgotten.push(...ids); return Promise.resolve(); }};
}

it('writes a purchase approved in the notification shade, at the first unlock', async () => {
  // The tap happened on a locked phone, where the ledger's key does not exist. This is the earliest
  // moment it can be honoured, and the owner should simply find it already in their history.
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([notice({decision: 'approved'})], ONE, null, approve, forget);
  expect(result).toEqual({approved: 1, rejected: 0, unrecorded: 0});
  expect(approved[0]).toMatchObject({accountId: 'a', minor: '-1250', merchant: 'WOOLWORTHS 1234', date: localDay(new Date(at))});
  expect(forgotten).toEqual(['n1']);
});

it('writes nothing for one rejected in the shade, and never asks again', async () => {
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([notice({decision: 'rejected'})], ONE, null, approve, forget);
  expect(result).toEqual({approved: 0, rejected: 1, unrecorded: 0});
  expect(approved).toEqual([]);
  expect(forgotten).toEqual(['n1']);
});

it('leaves an unanswered notification alone, to be asked about in the app', async () => {
  // Clearing or ignoring the notification is not an answer. This is what keeps a swiped-away question
  // waiting on the next opening instead of vanishing with the notification.
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([notice(), notice({id: 'n2'})], ONE, null, approve, forget);
  expect(result).toEqual({approved: 0, rejected: 0, unrecorded: 0});
  expect(approved).toEqual([]);
  expect(forgotten).toEqual([]);
});

it('does not force an approved notification the parser cannot read into the ledger', async () => {
  // Approving in the shade agrees to a purchase, not to an amount the app had to invent.
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions(
    [notice({decision: 'approved', text: 'Your available balance is $431.20.'})], ONE, null, approve, forget);
  expect(result).toEqual({approved: 0, rejected: 0, unrecorded: 1});
  expect(approved).toEqual([]);
  // Kept rather than forgotten, so it stays visible among the messages that were not about a purchase.
  expect(forgotten).toEqual([]);
});

it('forgets nothing when recording fails, so the purchase can still be answered', async () => {
  const forgotten: string[] = [];
  await expect(applyShadeDecisions([notice({decision: 'approved'})], ONE, null,
    () => Promise.reject(new Error('Storage is locked.')),
    ids => { forgotten.push(...ids); return Promise.resolve(); })).rejects.toThrow('Storage is locked.');
  expect(forgotten).toEqual([]);
});

it('settles a mixed batch in one pass', async () => {
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([
    notice({id: 'a1', decision: 'approved'}),
    notice({id: 'r1', decision: 'rejected', text: 'You spent $8.00 at CAFE MIKA.'}),
    notice({id: 'u1', text: 'You spent $31.20 at SYNTHETIC FUEL.'}),
  ], ONE, null, approve, forget);
  expect(result).toEqual({approved: 1, rejected: 1, unrecorded: 0});
  expect(approved).toHaveLength(1);
  expect(forgotten.sort()).toEqual(['a1', 'r1']);
});

/**
 * HIS PHONE: a dollar bank account that sorts first by name, and a peso wallet. "i just received money
 * from someone. the app read it and clicked approved. but didnt reflect on my balance, no money in. no
 * additional balance everywhere."
 */
const HIS = [
  {id: 'anz', currency: 'AUD', mask_last4: null, archived_at: null},
  {id: 'wallet', currency: 'PHP', mask_last4: null, archived_at: null},
];
const received = (over: Partial<Notice> = {}): Notice => notice({id: 'in1', source: 'app.synthetic.wallet',
  title: 'Synthetic Wallet', decision: 'approved',
  text: 'You have received PHP 500.00 from JUAN D. Your new balance is PHP 1,500.00. Ref. No. 1234567890.', ...over});

it('records money received in the wallet\'s currency on the wallet, not on the bank that sorts first', async () => {
  // Read against the first account's currency, this was "in PHP, not AUD": not recorded, not forgotten,
  // and never asked about again because it already carried an answer. The money arrived; the ledger
  // never heard about it.
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([received()], HIS, null, approve, forget);
  expect(result).toEqual({approved: 1, rejected: 0, unrecorded: 0});
  expect(approved[0]).toMatchObject({accountId: 'wallet', minor: '50000', merchant: 'JUAN D'});
  expect(forgotten).toEqual(['in1']);
});

it('puts a notice that names no currency on the main account, whatever sorts first', async () => {
  const {approve, forget, approved} = collect();
  await applyShadeDecisions([notice({id: 'b1', decision: 'approved', text: 'You spent $8.00 at CAFE MIKA.'})],
    HIS, 'anz', approve, forget);
  expect(approved[0]).toMatchObject({accountId: 'anz', minor: '-800'});
});

it('still leaves alone what reads in no currency he holds, and says how many', async () => {
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([received({text: 'You have received EUR 20.00 from a friend.'})], HIS, null, approve, forget);
  expect(result).toEqual({approved: 0, rejected: 0, unrecorded: 1});
  expect(approved).toEqual([]); expect(forgotten).toEqual([]);
});

it('treats an answer given after the first batch as new, so nothing approved later is skipped', () => {
  // One flag, set at the first batch, meant every later shade answer was neither applied nor asked about.
  const handled = new Set<string>();
  const first = shadeBatch([notice({decision: 'approved'})], handled);
  expect(first.map(n => n.id)).toEqual(['n1']);
  for (const n of first) handled.add(n.id);
  const later = shadeBatch([notice({decision: 'approved'}), received(), notice({id: 'open'})], handled);
  expect(later.map(n => n.id)).toEqual(['in1']);
});

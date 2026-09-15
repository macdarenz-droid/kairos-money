import {expect, it} from 'vitest';
import {applyShadeDecisions} from '../src/ui/notices';
import type {Notice} from '../src/ingest/notices';
import {currency} from '../src/core/money';

const AUD = currency('AUD');
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
  const result = await applyShadeDecisions([notice({decision: 'approved'})], AUD, 'a', approve, forget);
  expect(result).toEqual({approved: 1, rejected: 0});
  expect(approved[0]).toMatchObject({accountId: 'a', minor: '-1250', merchant: 'WOOLWORTHS 1234', date: '2026-08-26'});
  expect(forgotten).toEqual(['n1']);
});

it('writes nothing for one rejected in the shade, and never asks again', async () => {
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([notice({decision: 'rejected'})], AUD, 'a', approve, forget);
  expect(result).toEqual({approved: 0, rejected: 1});
  expect(approved).toEqual([]);
  expect(forgotten).toEqual(['n1']);
});

it('leaves an unanswered notification alone, to be asked about in the app', async () => {
  // Clearing or ignoring the notification is not an answer. This is what keeps a swiped-away question
  // waiting on the next opening instead of vanishing with the notification.
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions([notice(), notice({id: 'n2'})], AUD, 'a', approve, forget);
  expect(result).toEqual({approved: 0, rejected: 0});
  expect(approved).toEqual([]);
  expect(forgotten).toEqual([]);
});

it('does not force an approved notification the parser cannot read into the ledger', async () => {
  // Approving in the shade agrees to a purchase, not to an amount the app had to invent.
  const {approve, forget, approved, forgotten} = collect();
  const result = await applyShadeDecisions(
    [notice({decision: 'approved', text: 'Your available balance is $431.20.'})], AUD, 'a', approve, forget);
  expect(result).toEqual({approved: 0, rejected: 0});
  expect(approved).toEqual([]);
  // Kept rather than forgotten, so it stays visible among the messages that were not about a purchase.
  expect(forgotten).toEqual([]);
});

it('forgets nothing when recording fails, so the purchase can still be answered', async () => {
  const forgotten: string[] = [];
  await expect(applyShadeDecisions([notice({decision: 'approved'})], AUD, 'a',
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
  ], AUD, 'a', approve, forget);
  expect(result).toEqual({approved: 1, rejected: 1});
  expect(approved).toHaveLength(1);
  expect(forgotten.sort()).toEqual(['a1', 'r1']);
});

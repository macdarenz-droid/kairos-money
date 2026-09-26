import {expect, it} from 'vitest';
import {parseNotice, type Notice} from '../src/ingest/notices/parse';
import {routeNotices} from '../src/ingest/notices';
import {currency} from '../src/core/money';

const say = (text: string): Notice => ({id: 'n', source: 'com.synthetic.bank', title: 'Synthetic Bank', text, postedAt: Date.parse('2026-09-25T02:30:00Z')});

it('a notice with two amounts stays unreadable but offers each amount, signed by its wording', () => {
  const out = parseNotice(say('Purchase $11.95 at SYNTHETIC FUEL, card fee $0.50.'), currency('AUD'));
  expect(out).toMatchObject({status: 'skip', reason: 'The notification carries more than one amount, so which one was spent is unclear.'});
  expect(out.status === 'skip' && out.amounts).toEqual([{minor: '-1195', currency: 'AUD'}, {minor: '-50', currency: 'AUD'}]);
  const inward = parseNotice(say('You have received $40.00 from JANE D. Fee $1.00 waived.'), currency('AUD'));
  expect(inward.status === 'skip' && inward.amounts).toEqual([{minor: '4000', currency: 'AUD'}, {minor: '100', currency: 'AUD'}]);
});

it('repeated or foreign amounts are not offered twice or converted', () => {
  const out = parseNotice(say('Purchase $11.95 at SYNTHETIC FUEL. Pending $11.95. EUR 3.00 fee.'), currency('AUD'));
  expect(out.status === 'skip' && out.amounts).toEqual([{minor: '-1195', currency: 'AUD'}]);
  expect(parseNotice(say('Your one-time code is 1234.'), currency('AUD'))).not.toHaveProperty('amounts');
});

it('the routed unreadable notice carries the amounts and the account they were read against', () => {
  const accounts = [{id: 'cba', mask_last4: null, currency: 'AUD', name: 'Synthetic Bank', institution: 'Synthetic Bank'}];
  const {unreadable} = routeNotices([say('Purchase $11.95 at SYNTHETIC FUEL, card fee $0.50.')], accounts, null);
  expect(unreadable[0]).toMatchObject({accountId: 'cba', merchant: 'SYNTHETIC FUEL', amounts: [{minor: '-1195', currency: 'AUD'}, {minor: '-50', currency: 'AUD'}]});
});

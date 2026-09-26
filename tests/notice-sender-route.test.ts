import {expect, it} from 'vitest';
import {applyShadeDecisions} from '../src/ui/notices';
import type {Notice} from '../src/ingest/notices';
import type {NoticeRecord} from '../src/ledger/notices';
import type {NoticeAccount} from '../src/ingest/notices/route';

const westpac = {id: 'wbc', name: 'Westpac', institution: 'Westpac', currency: 'AUD', mask_last4: null, archived_at: null};
const commbank = {id: 'cba', name: 'CommBank', institution: 'CommBank', currency: 'AUD', mask_last4: null, archived_at: null};
const shade: Notice = {id: 'notice:1790000000:aa', source: 'com.commbank.netbank', title: 'CommBank', decision: 'approved',
  postedAt: Date.parse('2026-09-25T02:30:00Z'), text: 'You spent $12.50 at WOOLWORTHS 1234.'};

async function landed(accounts: NoticeAccount[], notice: Notice = shade) {
  const recorded: NoticeRecord[] = [];
  await applyShadeDecisions([notice], accounts, 'wbc', async r => { recorded.push(r); }, async () => {});
  return recorded.map(r => r.accountId);
}

it('a purchase approved in the shade from CommBank lands on CommBank, not the main account', async () => {
  expect(await landed([westpac, commbank])).toEqual(['cba']);
});

it('falls back to the main account when two accounts share the sender name', async () => {
  expect(await landed([westpac, commbank, {...commbank, id: 'cba2', name: 'CommBank Saver'}])).toEqual(['wbc']);
});

it('matches the sender only as a whole word', async () => {
  expect(await landed([westpac, {...commbank, name: 'Comm', institution: 'Comm'}])).toEqual(['wbc']);
});

it('an account named by its digits still wins over the sender', async () => {
  const tagged = {...westpac, mask_last4: '4407'};
  expect(await landed([tagged, commbank], {...shade, text: 'You spent $12.50 at WOOLWORTHS 1234 with card ending 407.'})).toEqual(['wbc']);
});

import {expect, it} from 'vitest';
import {parseNotice, type Notice} from '../src/ingest/notices/parse';
import {routeNotices} from '../src/ingest/notices';
import {currency} from '../src/core/money';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import {pickedRecord} from '../src/ingest/notices';
import type {Document, ImportContext} from '../src/ingest/types';

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

it('a picked amount from a notice that names no shop is absorbed by its statement row', async () => {
  const context: ImportContext = {accountId: 'cba', accountKind: 'checking', currency: 'AUD', period: {start: '2026-09-01', end: '2026-09-27'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};
  for (const [title, text] of [['Kairo Bank', 'Purchase of $11.95 approved at 12.30pm.'], ['CommBank', 'You spent $11.95, fee $0.50.']] as const) {
    const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    const account = {id: 'cba', name: title, institution: title, type: 'checking' as const, currency: 'AUD' as const, mask_last4: null, opening_balance_minor: 0n};
    await repo.addAccount(account);
    const notice: Notice = {id: 'notice:1790000000:aa', source: 'com.synthetic.bank', title, decision: 'approved', postedAt: Date.parse('2026-09-25T02:30:00Z'), text};
    const item = routeNotices([notice], [{...account, archived_at: null}], null).unreadable[0]!;
    await repo.notices.approve(pickedRecord({...item, accountId: item.accountId!}, item.amounts![0]!));
    const fileHash = hash('st');
    const doc: Document = {id: hash(JSON.stringify(['cba', fileHash])), hash: fileHash, fileName: 'cba.csv', parser: 'synthetic-statement', context,
      opening: '10000', closing: '8805', payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A',
      rows: [normalizeRow({sourceId: '0', date: '25/09/2026', description: 'FUEL STOP 22 SUNNYVALE', amount: '11.95', direction: 'debit', confidence: 9800}, context)]};
    await repo.imports.stage(doc);
    for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
    await repo.imports.commit(doc.id);
    expect((await driver.query('SELECT status FROM transactions')).filter(r => r.status === 'pending')).toEqual([]);
    raw.close();
  }
});

it('a notice with several amounts is pinned to the first account that offers them', () => {
  const accounts = [{id: 'cba', mask_last4: null, currency: 'AUD', name: 'Synthetic Bank', institution: 'Synthetic Bank'},
    {id: 'w', mask_last4: null, currency: 'PHP', name: 'Synthetic Wallet', institution: 'Synthetic Wallet'}];
  const notice: Notice = {id: 'n', source: 'com.synthetic.wallet', title: 'Alert', text: 'You received PHP 500.00 from JANE D. Fee PHP 20.00.', postedAt: Date.parse('2026-09-25T02:30:00Z')};
  const {unreadable} = routeNotices([notice], accounts, 'cba');
  expect(unreadable[0]).toMatchObject({accountId: 'w', amounts: [{minor: '50000', currency: 'PHP'}, {minor: '2000', currency: 'PHP'}]});
});

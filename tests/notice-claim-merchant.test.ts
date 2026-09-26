import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import {parseNotice} from '../src/ingest/notices/parse';
import {currency} from '../src/core/money';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId:'cba',accountKind:'checking',currency:'AUD',period:{start:'2026-09-01',end:'2026-09-25'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};

async function ready() {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id:'cba',name:'CommBank',institution:'CommBank',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  return {driver, raw, repo};
}

// A settled CSV (ends 25 Sep) holding one different purchase of the same amount: CAFE MIKA -5.00 on 23 Sep.
function statement(description = 'CAFE MIKA'): Document {
  const fileHash = hash('statement:' + description);
  return {id: hash(JSON.stringify(['cba', fileHash])), hash: fileHash, fileName: 'cba.csv', parser: 'synthetic-statement', context,
    opening: '10000', closing: '9500', payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A',
    rows: [normalizeRow({sourceId: '0', date: '23/09/2026', description, amount: '5.00', direction: 'debit', confidence: 9800}, context)]};
}

async function accept(repo: Awaited<ReturnType<typeof ready>>['repo'], doc: Document) {
  await repo.imports.stage(doc);
  for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
  return repo.imports.commit(doc.id);
}

const bakery = {id: 'n-bakery', accountId: 'cba', date: '2026-09-26', minor: '-500', merchant: 'BAKERY TWO',
  description: 'You spent $5.00 at BAKERY TWO.', source: 'com.commbank.netbank', capturedAt: '2026-09-26T01:00:00Z'};

const ledger = async (driver: Awaited<ReturnType<typeof ready>>['driver']) =>
  (await driver.query('SELECT posted_date,amount_minor,raw_description,status FROM transactions ORDER BY posted_date')).map(r => ({...r}));

describe('an approved notice for a different purchase of the same amount', () => {
  it('stays when the statement is already imported (approve after import)', async () => {
    const {driver, raw, repo} = await ready();
    await accept(repo, statement());
    await repo.notices.approve(bakery);
    const rows = await ledger(driver);
    expect(rows.map(r => r.raw_description)).toContain('BAKERY TWO');
    raw.close();
  });

  it('stays when a later import commits', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(bakery);
    const before = await ledger(driver);
    expect(before.map(r => r.raw_description)).toEqual(['BAKERY TWO']);
    await accept(repo, statement());
    const after = await ledger(driver);
    expect(after.map(r => r.raw_description)).toContain('BAKERY TWO');
    raw.close();
  });

  it('control: 4 days apart the notice stays', async () => {
    const {driver, raw, repo} = await ready();
    await accept(repo, statement());
    await repo.notices.approve({...bakery, id: 'n-bakery-27', date: '2026-09-27'});
    const rows = await ledger(driver);
    expect(rows.map(r => r.raw_description)).toContain('BAKERY TWO');
    raw.close();
  });

  it('guard: the same shop in the statement\'s wording still absorbs the notice', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve({...bakery, id: 'n-woolies', merchant: 'Woolworths 1234', description: 'You spent $5.00 at Woolworths 1234.'});
    await accept(repo, statement('WOOLWORTHS 1234 SYDNEY'));
    expect((await ledger(driver)).map(r => r.raw_description)).toEqual(['WOOLWORTHS 1234 SYDNEY']);
    raw.close();
  });

  it('guard: a notice whose bank named no merchant still pairs on amount and date', async () => {
    const {driver, raw, repo} = await ready();
    const body = 'CommBank A payment of $5.00 was made from your account.';
    await repo.notices.approve({...bakery, id: 'n-unnamed', merchant: body.slice(0, 60), description: body});
    await accept(repo, statement());
    expect((await ledger(driver)).map(r => r.raw_description)).toEqual(['CAFE MIKA']);
    raw.close();
  });
});

describe('pairing edges', () => {
  it('an unnamed-merchant notice whose 60th character is a space still pairs on amount and date', async () => {
    const {driver, raw, repo} = await ready();
    const parsed = parseNotice({id: 'n', source: 'com.commbank.netbank', title: 'CommBank',
      text: 'A payment of $5.00 was made from your account with a card today.', postedAt: Date.parse('2026-09-24T01:00:00Z')}, currency('AUD'));
    if (parsed.status !== 'ok') throw new Error(parsed.reason);
    expect(parsed.description[59]).toBe(' ');
    await repo.notices.approve({id: 'n-unnamed', accountId: 'cba', date: parsed.date, minor: parsed.minor, merchant: parsed.merchant,
      description: parsed.description, source: 'com.commbank.netbank', capturedAt: '2026-09-24T01:00:00Z'});
    await accept(repo, statement());
    expect((await ledger(driver)).map(r => [r.raw_description, r.status])).toEqual([['CAFE MIKA', 'settled']]);
    raw.close();
  });

  it('an apostrophe in the shop name still matches the statement', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve({...bakery, id: 'n-mcd', date: '2026-09-23', merchant: "McDonald's", description: "You spent $5.00 at McDonald's."});
    await accept(repo, statement('MCDONALDS 1234 SYDNEY'));
    expect((await ledger(driver)).map(r => r.raw_description)).toEqual(['MCDONALDS 1234 SYDNEY']);
    raw.close();
  });

  it('two same-amount notices whose rows settle in the other order are both absorbed', async () => {
    const {driver, raw, repo} = await ready();
    const fileHash = hash('statement:crossing');
    const doc: Document = {id: hash(JSON.stringify(['cba', fileHash])), hash: fileHash, fileName: 'cba.csv', parser: 'synthetic-statement', context,
      opening: '10000', closing: '9000', payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A',
      rows: [normalizeRow({sourceId: '0', date: '21/09/2026', description: 'BAKERY BETA', amount: '5.00', direction: 'debit', confidence: 9800}, context),
        normalizeRow({sourceId: '1', date: '22/09/2026', description: 'CAFE ALPHA', amount: '5.00', direction: 'debit', confidence: 9800}, context)]};
    await repo.notices.approve({...bakery, id: 'n-alpha', date: '2026-09-20', merchant: 'CAFE ALPHA', description: 'You spent $5.00 at CAFE ALPHA.'});
    await repo.notices.approve({...bakery, id: 'n-beta', date: '2026-09-21', merchant: 'BAKERY BETA', description: 'You spent $5.00 at BAKERY BETA.'});
    await accept(repo, doc);
    expect((await ledger(driver)).map(r => [r.raw_description, r.status])).toEqual([['BAKERY BETA', 'settled'], ['CAFE ALPHA', 'settled']]);
    raw.close();
  });
});

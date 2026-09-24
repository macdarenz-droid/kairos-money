import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-02-01',end:'2026-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};

async function ready() {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id:'a',name:'Synthetic',institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  return {driver, raw, repo};
}
type Repo = Awaited<ReturnType<typeof ready>>['repo'];

async function accept(repo: Repo, doc: Document) {
  await repo.imports.stage(doc);
  for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
  return repo.imports.commit(doc.id);
}

/** One purchase as a given source family saw it. */
function source(kind: 'statement' | 'export', description: string, date = '2026-02-10', pending = false): Document {
  const fileHash = hash(kind + description + date + String(pending));
  return {id: hash(JSON.stringify(['a', fileHash])), hash: fileHash, fileName: kind + '.csv', parser: 'synthetic-' + kind, context,
    opening: '10000', closing: '8750', payslip: null, sourceRank: kind === 'statement' ? 2 : 3, sourceKind: kind, integrityTier: pending ? 'C' : 'A',
    rows: [normalizeRow({sourceId: '0', date, description, amount: '12.50', direction: 'debit', confidence: 9800, pending}, context)]};
}

const categoryOf = async (driver: Awaited<ReturnType<typeof ready>>['driver']) =>
  (await driver.query('SELECT t.id,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id'));

/** A grocery row the app suggests a category for, accepted with "use suggested categories". */
async function suggested(repo: Repo, correction?: string) {
  const doc = source('statement', 'WOOLWORTHS METRO 1234 SYDNEY');
  await repo.imports.stage(doc);
  await repo.imports.useSuggestedCategories(doc.id);
  const row = doc.rows[0]!;
  if (correction) await repo.imports.correct(doc.id, row.sourceId, {...row, category: correction}, false);
  await repo.imports.commit(doc.id);
  return row.merchant;
}

describe('a category chosen in import review', () => {
  it('stays the owner’s after they change an accepted suggestion, so Claude never overwrites it', async () => {
    const {driver, raw, repo} = await ready();
    const merchant = await suggested(repo, 'Eating out');
    await repo.aiCategories.applyRun([{key: merchant, category: 'Coffee & snacks', confidence: 'high'}], 'claude-test');
    expect((await categoryOf(driver)).map(r => r.name)).toEqual(['Eating out']);
    expect((await repo.imports.ledger())[0]!.categoryFrom).toBeUndefined();
    raw.close();
  });

  it('keeps an owner tag set on the ledger over a later Claude answer', async () => {
    const {driver, raw, repo} = await ready();
    const merchant = await suggested(repo);
    const [row] = await categoryOf(driver);
    await repo.categories.set([String(row!.id)], 'Eating out');
    await repo.aiCategories.applyRun([{key: merchant, category: 'Coffee & snacks', confidence: 'high'}], 'claude-test');
    expect((await categoryOf(driver)).map(r => r.name)).toEqual(['Eating out']);
    raw.close();
  });
});

describe('an accepted suggestion', () => {
  it('gives way to a Claude answer', async () => {
    const {driver, raw, repo} = await ready();
    const merchant = await suggested(repo);
    expect((await categoryOf(driver)).map(r => r.name)).toEqual(['Groceries']);
    await repo.aiCategories.applyRun([{key: merchant, category: 'Coffee & snacks', confidence: 'high'}], 'claude-test');
    expect((await categoryOf(driver)).map(r => r.name)).toEqual(['Coffee & snacks']);
    raw.close();
  });

  it('gives way to an owner rule', async () => {
    const {driver, raw, repo} = await ready();
    const merchant = await suggested(repo);
    await driver.execute('INSERT INTO rules(id,priority,matcher,action,created_by) VALUES(?,0,?,?,?)', ['r1', JSON.stringify({merchant}), JSON.stringify({category: 'Eating out'}), 'user']);
    await repo.imports.rebuild();
    expect((await categoryOf(driver)).map(r => r.name)).toEqual(['Eating out']);
    raw.close();
  });

  it('gives way to a confirmed merchant default', async () => {
    const {driver, raw, repo} = await ready();
    const merchant = await suggested(repo);
    const id = hash('category:Shopping');
    await driver.execute("INSERT OR IGNORE INTO categories(id,name,kind) VALUES(?,'Shopping','discretionary')", [id]);
    await driver.execute('UPDATE merchants SET default_category_id=? WHERE canonical_name=?', [id, merchant]);
    await repo.imports.rebuild();
    expect((await categoryOf(driver)).map(r => r.name)).toEqual(['Shopping']);
    raw.close();
  });
});

describe('a pending copy imported after its settled row', () => {
  // The settlement takes the pending row's id in every import order, so the owner's edits have to follow it.
  it('keeps the owner’s category, note and receipt note on the one transaction', async () => {
    const {driver, raw, repo} = await ready();
    await accept(repo, source('statement', 'SYNTHETIC CAFE NEWTOWN'));
    const [before] = await driver.query('SELECT id FROM transactions');
    const id = String(before!.id);
    await repo.categories.set([id], 'Eating out');
    await driver.execute('UPDATE transactions SET notes=? WHERE id=?', ['with Sam', id]);
    await repo.attachments.note(id, 'Lunch receipt');

    await expect(accept(repo, source('export', 'SYNTHETIC CAFE NEWTOWN', '2026-02-09', true))).resolves.toMatchObject({added: 0, known: 1});
    const after = await driver.query('SELECT t.id,t.notes,t.status,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({notes: 'with Sam', status: 'settled', name: 'Eating out'});
    expect((await repo.attachments.read(String(after[0]!.id))).note).toBe('Lunch receipt');
    raw.close();
  });
});

describe('rolling back the source whose id a merged row kept', () => {
  it('moves the owner’s edits to the row that survives', async () => {
    const {driver, raw, repo} = await ready();
    const one = source('statement', 'SYNTHETIC CAFE NEWTOWN'), two = source('export', 'SYNTHETIC CAFE NEWTOWN AU');
    await repo.imports.stage(one); await repo.imports.commit(one.id);
    const [before] = await driver.query('SELECT id FROM transactions');
    const id = String(before!.id);
    await repo.categories.set([id], 'Eating out');
    await driver.execute('UPDATE transactions SET notes=? WHERE id=?', ['with Sam', id]);
    await repo.splits.save(id, [{category: 'Eating out', minor: '1000'}, {category: 'Shopping', minor: '250'}]);
    await repo.attachments.note(id, 'Lunch receipt');
    await repo.foreignCurrency.save(id, {originalMinor: '800', originalCurrency: 'USD', note: 'Card slip'});
    await repo.imports.stage(two); await repo.imports.commit(two.id);
    expect((await driver.query('SELECT id FROM transactions')).map(r => r.id)).toEqual([id]);

    await repo.imports.rollback(one.id);
    const after = await driver.query('SELECT t.id,t.notes,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id');
    expect(after).toHaveLength(1);
    const survivor = String(after[0]!.id);
    expect(survivor).not.toBe(id);
    expect(after[0]).toEqual({id: survivor, notes: 'with Sam', name: 'Eating out'});
    expect(await repo.splits.get(survivor)).toMatchObject({id: survivor, minor: '-1250'});
    expect((await repo.attachments.read(survivor)).note).toBe('Lunch receipt');
    expect((await repo.foreignCurrency.read(survivor)).active).toBe(true);
    expect(await driver.query('SELECT key FROM app_settings WHERE key LIKE ?', ['%' + id])).toEqual([]);
    raw.close();
  });
});

import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import type {Driver} from '../src/core/db/driver';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import {categorize} from '../src/ledger/rules';
import {categorisationPayload} from '../src/ledger/ai-categories';
import type {Document, ImportContext, LedgerRow} from '../src/ingest/types';

const context: ImportContext = {accountId: 'acct-7', accountKind: 'checking', currency: 'AUD', period: {start: '2026-02-01', end: '2026-02-28'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};
const raw = (sourceId: string, date: string, description: string, amount: string, direction: 'debit' | 'credit' = 'debit') =>
  normalizeRow({sourceId, date, description, amount, direction, confidence: 9800}, context);

function ledgerRow(over: Partial<LedgerRow> & {description: string; minor: string}): LedgerRow {
  const base = raw('0', '2026-02-10', over.description, '1.00');
  return {...base, id: hash(over.description + over.minor + (over.date ?? '')), owner: 'b', transferGroup: null, sources: [], ...over, merchant: over.merchant ?? base.merchant};
}

describe('the categorisation payload', () => {
  const rows = [
    ledgerRow({description: 'CAFE LUNA 123456 NEWTOWN', minor: '-450', date: '2026-02-03'}),
    ledgerRow({description: 'CAFE LUNA 123456 NEWTOWN', minor: '-520', date: '2026-02-05'}),
    ledgerRow({description: 'ACME PAYROLL 99887766', minor: '250000', date: '2026-02-07'}),
    ledgerRow({description: 'CHEMIST 4321 SYDNEY', minor: '-1500', date: '2026-02-08'}),
    ledgerRow({description: 'TRANSFER TO SAVINGS 4455', minor: '-10000', transferGroup: 'g'}),
    ledgerRow({description: 'HARDWARE HOUSE', minor: '-8900', id: 'split-me'}),
  ];
  const payload = categorisationPayload(rows, {splitIds: new Set(['split-me']),
    examples: [{description: 'GYM CLUB 12345678', category: 'Fitness & wellbeing'}]});

  it('sends one entry per merchant, never transfers or split rows', () => {
    expect(payload.sent.merchants).toHaveLength(3);
    const cafe = payload.sent.merchants.find(m => m.description.startsWith('CAFE'))!;
    expect(cafe).toEqual({id: expect.stringMatching(/^m\d+$/), description: 'CAFE LUNA #### NEWTOWN', direction: 'out', band: 'under 10', count: 2, mcc: null, category: null});
    expect(payload.sent.merchants.find(m => m.description.startsWith('ACME'))).toMatchObject({direction: 'in', band: 'over 1000'});
    expect(payload.keys[cafe.id]).toBe(rows[0]!.merchant);
  });

  it('carries no dates, exact amounts, accounts, merchant keys or unmasked digit runs', () => {
    expect(Object.keys(payload.sent).sort()).toEqual(['examples', 'merchants']);
    expect(rows[3]!.merchant).toContain('4321');
    const sent = JSON.stringify(payload.sent);
    for (const secret of ['2026-02', '450', '520', '250000', 'acct-7', '123456', '99887766', '12345678', '4321', 'TRANSFER', 'HARDWARE'])
      expect(sent).not.toContain(secret);
    expect(payload.sent.examples).toEqual([{description: 'GYM CLUB ####', category: 'Fitness & wellbeing'}]);
  });

  it('bands a merchant by its main currency, whatever the row order', () => {
    const mixed = [
      ledgerRow({description: 'DUTY FREE', minor: '-150000', currency: 'JPY'}),
      ledgerRow({description: 'DUTY FREE', minor: '-450'}),
      ledgerRow({description: 'DUTY FREE', minor: '-520'}),
    ];
    const bandOf = (list: LedgerRow[]) => categorisationPayload(list, {splitIds: new Set(), examples: []}).sent.merchants[0]!.band;
    expect(bandOf(mixed)).toBe('under 10');
    expect(bandOf([...mixed].reverse())).toBe('under 10');
  });
});

describe('precedence in categorize()', () => {
  const row = raw('0', '2026-02-10', 'CAFE LUNA', '4.50');
  const ai = {[row.merchant]: 'Coffee & snacks'};
  it('puts Claude below the owner and above MCC and hints', () => {
    expect(categorize(row, [{id: 'r', priority: 0, merchant: row.merchant, category: 'Eating out'}], {}, '5812', ai).category).toBe('Eating out');
    expect(categorize(row, [], {[row.merchant]: 'Groceries'}, '5812', ai).category).toBe('Groceries');
    expect(categorize(row, [], {}, '5812', ai)).toMatchObject({category: 'Coffee & snacks', confidence: 9300});
    expect(categorize(row, [], {}, '5812', {}).category).not.toBe('Coffee & snacks');
  });
});

describe('storing and undoing a Claude run', () => {
  async function ledger() {
    const {driver, raw: db} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    await repo.addAccount({id: 'acct-7', name: 'Everyday', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
    const rows = [raw('0', '2026-02-03', 'CAFE LUNA', '4.50'), raw('1', '2026-02-04', 'CAFE LUNA', '5.20'), raw('2', '2026-02-05', 'BOOK NOOK', '20.00'), raw('3', '2026-02-06', 'MYSTERY CO', '9.00')];
    const fileHash = hash('ai-statement');
    const doc: Document = {id: hash(JSON.stringify(['acct-7', fileHash])), hash: fileHash, fileName: 's.csv', parser: 'synthetic', context,
      opening: '10000', closing: (10000n - 450n - 520n - 2000n - 900n).toString(), payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A', rows};
    await repo.imports.stage(doc);
    for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
    await repo.imports.commit(doc.id);
    const idOf = async (description: string) => String((await driver.query('SELECT id FROM transactions WHERE raw_description=? ORDER BY posted_date', [description]))[0]!.id);
    const categories = async () => Object.fromEntries((await driver.query('SELECT t.id,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id ORDER BY t.id')).map(r => [String(r.id), r.name]));
    return {driver, db, repo, doc, rows, idOf, categories};
  }
  const answer = (merchant: string, category: string, confidence: 'high' | 'medium' | 'low') => ({key: merchant, category, confidence});

  it('applies high and medium answers, keeps low ones as proposals, and never beats an owner tag', async () => {
    const {driver, db, repo, rows, idOf, categories} = await ledger();
    const [cafe, , book, mystery] = rows;
    const owned = await idOf('BOOK NOOK');
    await repo.categories.set([owned], 'Gifts & donations');
    const run = await repo.aiCategories.applyRun([
      answer(cafe!.merchant, 'Coffee & snacks', 'high'), answer(book!.merchant, 'Hobbies & media', 'medium'),
      answer(mystery!.merchant, 'Shopping', 'low'), answer('NOT A MERCHANT', 'Shopping', 'high'), answer(cafe!.merchant + 'X', 'Nonsense', 'high'),
    ], 'claude-opus-5');
    expect(run.applied.sort()).toEqual([book!.merchant, cafe!.merchant].sort());
    expect(run.proposals).toEqual([{key: mystery!.merchant, category: 'Shopping'}]);
    const now = await categories();
    expect(now[await idOf('CAFE LUNA')]).toBe('Coffee & snacks');
    expect(now[owned]).toBe('Gifts & donations');
    expect(now[await idOf('MYSTERY CO')]).toBeNull();
    const stored = await driver.query("SELECT value FROM app_settings WHERE key=?", ['ai-category:' + cafe!.merchant]);
    expect(JSON.parse(String(stored[0]!.value))).toMatchObject({category: 'Coffee & snacks', confidence: 'high', model: 'claude-opus-5'});
    const materialized = await repo.imports.ledger();
    expect(materialized.find(r => r.merchant === cafe!.merchant)?.categoryFrom).toBe('ai');
    expect(materialized.find(r => r.id === owned)?.categoryFrom).toBeUndefined();
    db.close();
  });

  it('survives a rebuild and a re-import, and undo restores exactly', async () => {
    const {driver, db, repo, doc, rows, categories} = await ledger();
    const before = {categories: await categories(), settings: await driver.query("SELECT * FROM app_settings WHERE key NOT LIKE 'ai-run:%' ORDER BY key")};
    const run = await repo.aiCategories.applyRun([answer(rows[0]!.merchant, 'Coffee & snacks', 'high')], 'claude-opus-5');
    const applied = await categories();
    await repo.imports.rollback(doc.id); await repo.imports.stage(doc);
    for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
    await repo.imports.commit(doc.id);
    expect(await categories()).toEqual(applied);
    await repo.aiCategories.undoRun(run.id);
    expect({categories: await categories(), settings: await driver.query("SELECT * FROM app_settings WHERE key NOT LIKE 'ai-run:%' ORDER BY key")}).toEqual(before);
    await expect(repo.aiCategories.undoRun(run.id)).rejects.toThrow();
    db.close();
  });

  async function twoRuns() {
    const setup = await ledger();
    const key = setup.rows[0]!.merchant, at = '2026-09-24T00:00:00.000Z';
    const snapshot = async () => ({categories: await setup.categories(), settings: await setup.driver.query('SELECT * FROM app_settings ORDER BY key')});
    const start = await snapshot();
    const older = await setup.repo.aiCategories.applyRun([answer(key, 'Coffee & snacks', 'high')], 'claude-opus-5', at);
    const newer = await setup.repo.aiCategories.applyRun([answer(key, 'Eating out', 'high')], 'claude-opus-5', at);
    return {...setup, key, older, newer, start, snapshot};
  }

  it('undoes two runs on the same merchant newest first, back to the start', async () => {
    const {db, repo, key, older, newer, start, snapshot} = await twoRuns();
    await repo.aiCategories.undoRun(newer.id);
    expect((await repo.aiCategories.read(key))?.category).toBe('Coffee & snacks');
    await repo.aiCategories.undoRun(older.id);
    expect(await snapshot()).toEqual(start);
    db.close();
  });

  it('refuses to undo an older run while a newer run still covers its merchant', async () => {
    const {db, repo, key, older, newer, start, snapshot} = await twoRuns();
    const applied = await snapshot();
    await expect(repo.aiCategories.undoRun(older.id)).rejects.toThrow('A newer sorting run changed these merchants. Undo that one first.');
    expect(await snapshot()).toEqual(applied);
    expect((await repo.aiCategories.read(key))?.category).toBe('Eating out');
    await repo.aiCategories.undoRun(newer.id); await repo.aiCategories.undoRun(older.id);
    expect(await snapshot()).toEqual(start);
    db.close();
  });
});

describe('re-sorting after a Claude run, an undo or an owner rule', () => {
  // On the phone each native write is a bridge call, so a category change must not rewrite every row.
  async function large(n: number) {
    const {driver: inner, raw: db} = memoryDriver(); let writes = 0;
    const driver: Driver = {...inner, execute: (sql, values) => { writes += 1; return inner.execute(sql, values); }};
    await migrate(driver); const repo = repository(driver);
    await repo.addAccount({id: 'acct-7', name: 'Everyday', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
    const names = ['CAFE LUNA', 'BOOK NOOK', 'MYSTERY CO'];
    const rows = Array.from({length: n}, (_, i) => raw(String(i), `2026-02-${String(1 + i % 28).padStart(2, '0')}`, names[i % 3]!, `${1 + i}.00`));
    const spent = rows.reduce((sum, _, i) => sum + BigInt(100 * (1 + i)), 0n), fileHash = hash('ai-large');
    const doc: Document = {id: hash(JSON.stringify(['acct-7', fileHash])), hash: fileHash, fileName: 'l.csv', parser: 'synthetic', context,
      opening: '1000000', closing: (1000000n - spent).toString(), payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A', rows};
    await repo.imports.stage(doc);
    for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
    await repo.imports.commit(doc.id);
    const counted = async (work: () => Promise<unknown>) => { writes = 0; await work(); return writes; };
    const state = async () => ({transactions: await driver.query('SELECT id,category_id FROM transactions ORDER BY id'), categories: await driver.query('SELECT id,name,kind FROM categories ORDER BY id')});
    return {db, repo, rows, counted, state};
  }

  it('writes a handful of statements however long the ledger is', async () => {
    const {db, repo, rows, counted} = await large(90);
    let run = null as Awaited<ReturnType<typeof repo.aiCategories.applyRun>> | null;
    expect(await counted(async () => { run = await repo.aiCategories.applyRun([{key: rows[0]!.merchant, category: 'Coffee & snacks', confidence: 'high'}], 'claude-opus-5'); })).toBeLessThan(15);
    expect(await counted(() => repo.aiCategories.undoRun(run!.id))).toBeLessThan(15);
    expect(await counted(() => repo.merchantRules.set(rows[1]!.merchant, 'Hobbies & media'))).toBeLessThan(15);
    db.close();
  });

  it('does not send merchants Claude already sorted again, until that run is undone', async () => {
    const {db, repo, rows} = await large(30);
    const sent = async () => Object.values((await repo.aiCategories.payload(false)).keys).sort();
    const all = await sent();
    const run = await repo.aiCategories.applyRun([{key: rows[0]!.merchant, category: 'Coffee & snacks', confidence: 'high'}, {key: rows[1]!.merchant, category: 'Shopping', confidence: 'low'}], 'claude-opus-5');
    expect(await sent()).toEqual(all.filter(key => key !== rows[0]!.merchant));
    await repo.aiCategories.undoRun(run.id);
    expect(await sent()).toEqual(all);
    db.close();
  });

  it('leaves the ledger exactly as a full rebuild would', async () => {
    const {db, repo, rows, state} = await large(30);
    const tagged = String((await repo.imports.ledger()).find(r => r.merchant === rows[2]!.merchant)!.id);
    await repo.categories.set([tagged], 'Gifts & donations');
    await repo.aiCategories.applyRun([{key: rows[0]!.merchant, category: 'Coffee & snacks', confidence: 'high'}, {key: rows[2]!.merchant, category: 'Shopping', confidence: 'medium'}], 'claude-opus-5');
    await repo.merchantRules.set(rows[1]!.merchant, 'Hobbies & media');
    const run = await repo.aiCategories.applyRun([{key: rows[0]!.merchant, category: 'Eating out', confidence: 'high'}], 'claude-opus-5');
    await repo.aiCategories.undoRun(run.id);
    const sorted = await state();
    expect(sorted.transactions.filter(t => t.id === tagged)[0]?.category_id).toBe(hash('category:Gifts & donations'));
    await repo.imports.rebuild();
    expect(await state()).toEqual(sorted);
    db.close();
  });
});

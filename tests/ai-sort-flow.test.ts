import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';
import {estimateMicros, sortAfterImport, sortMerchants} from '../src/ui/advisor/sort';

const context: ImportContext = {accountId: 'acct-7', accountKind: 'checking', currency: 'AUD', period: {start: '2026-02-01', end: '2026-02-28'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};
const raw = (sourceId: string, date: string, description: string, amount: string) =>
  normalizeRow({sourceId, date, description, amount, direction: 'debit', confidence: 9800}, context);

async function ledger() {
  const {driver, raw: db} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'acct-7', name: 'Everyday', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  const rows = [raw('0', '2026-02-03', 'CAFE LUNA', '4.50'), raw('1', '2026-02-05', 'MYSTERY CO', '9.00')];
  const fileHash = hash('ai-flow');
  const doc: Document = {id: hash(JSON.stringify(['acct-7', fileHash])), hash: fileHash, fileName: 's.csv', parser: 'synthetic', context,
    opening: '10000', closing: String(10000 - 450 - 900), payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A', rows};
  await repo.imports.stage(doc);
  for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
  await repo.imports.commit(doc.id);
  const run = <T,>(fn: (r: Repository) => Promise<T>) => fn(repo);
  const category = async (d: string) => (await driver.query('SELECT c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.raw_description=?', [d]))[0]?.name ?? null;
  return {db, repo, run, category};
}
const reply = (body: unknown, status = 200) => async (_: unknown, init?: RequestInit) => {
  const asked = (JSON.parse((JSON.parse(String(init?.body)) as {messages: {content: string}[]}).messages[0]!.content) as {merchants: {id: string; description: string}[]}).merchants;
  return new Response(JSON.stringify(status === 200 ? {id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn', stop_sequence: null,
    usage: {input_tokens: 800, output_tokens: 100}, content: [{type: 'text', text: JSON.stringify((body as (a: typeof asked) => unknown)(asked))}]} : {type: 'error', error: {type: 'authentication_error', message: 'x'}}),
    {status, headers: {'content-type': 'application/json'}});
};
const on = {enabled: true, model: 'claude-opus-5' as const, merchantNames: false, sortConsent: true, autoSort: false};

it('does nothing until the advisor is on, a key is saved and sorting is allowed', async () => {
  const {db, repo, run} = await ledger();
  expect(await sortMerchants(run, false)).toEqual({ok: false, reason: 'setup'});
  await repo.advisor.save(on);
  expect(await sortMerchants(run, false)).toEqual({ok: false, reason: 'setup'});
  expect(await repo.privacy.advisorCalls()).toEqual([]);
  db.close();
});

it('applies confident answers, keeps unsure ones to check, and logs the call', async () => {
  const {db, repo, run, category} = await ledger();
  await repo.advisor.save(on); await repo.advisor.setKey('sk-ant-synthetic-0123456789abcdef');
  const answers = (asked: {id: string; description: string}[]) => ({answers: asked.map(m => ({id: m.id, category: m.description === 'CAFE LUNA' ? 'Coffee & snacks' : 'Shopping', confidence: m.description === 'CAFE LUNA' ? 'high' : 'low'}))});
  const result = await sortMerchants(run, false, {fetch: reply(answers) as typeof fetch, maxRetries: 0});
  expect(result.ok && result.run.applied.length).toBe(1);
  expect(result.ok && result.run.proposals.map(p => p.category)).toEqual(['Shopping']);
  expect(await category('CAFE LUNA')).toBe('Coffee & snacks');
  expect(await category('MYSTERY CO')).toBeNull();
  expect(await repo.privacy.advisorCalls()).toMatchObject([{model: 'claude-opus-5', inputTokens: 800, outputTokens: 100, costMicros: '6500', result: 'ok'}]);
  expect(estimateMicros(await repo.aiCategories.payload(false), 'claude-opus-5')).toBeGreaterThan(0n);
  db.close();
});

it('changes nothing when Claude refuses the key, and still logs the call', async () => {
  const {db, repo, run, category} = await ledger();
  await repo.advisor.save(on); await repo.advisor.setKey('sk-ant-synthetic-0123456789abcdef');
  expect(await sortMerchants(run, false, {fetch: reply(null, 401) as typeof fetch, maxRetries: 0})).toEqual({ok: false, reason: 'key'});
  expect(await category('CAFE LUNA')).toBeNull();
  expect(await repo.aiCategories.runs()).toEqual([]);
  expect((await repo.privacy.advisorCalls()).map(c => c.result)).toEqual(['key']);
  db.close();
});

it('sorts only new merchants after an import, and only when switched on', async () => {
  const {db, repo, run, category} = await ledger();
  await repo.advisor.setKey('sk-ant-synthetic-0123456789abcdef');
  const all = (asked: {id: string}[]) => ({answers: asked.map(m => ({id: m.id, category: 'Shopping', confidence: 'high'}))});
  const options = {fetch: reply(all) as typeof fetch, maxRetries: 0};
  await repo.advisor.save({...on, autoSort: false});
  expect(await sortAfterImport(run, options)).toBe('');
  expect(await category('MYSTERY CO')).toBeNull();
  await repo.merchantRules.set((await repo.imports.ledger()).find(r => r.description === 'CAFE LUNA')!.merchant, 'Eating out');
  await repo.advisor.save({...on, autoSort: true});
  expect(await sortAfterImport(run, {fetch: reply(null, 401) as typeof fetch, maxRetries: 0})).toBe('New merchants were not sorted: Claude did not accept the key. Check it in Settings.');
  expect(await sortAfterImport(run, options)).toBe('Claude sorted 1 new merchant.');
  expect([await category('CAFE LUNA'), await category('MYSTERY CO')]).toEqual(['Eating out', 'Shopping']);
  expect(await sortAfterImport(run, options)).toBe('');
  db.close();
});

// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';
import {ImportWorkspace} from '../src/ui/screens/ImportWorkspace';

const state = vi.hoisted(() => ({repo: undefined as Repository | undefined}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: () => ({})}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: <T,>(fn: (r: Repository) => Promise<T>) => fn(state.repo!)})}));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD', period: {start: '2026-02-01', end: '2026-02-28'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};
const raw = (sourceId: string, date: string, description: string, amount: string) => normalizeRow({sourceId, date, description, amount, direction: 'debit', confidence: 9800}, context);
beforeEach(async () => {
  const {driver} = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({id: 'a', name: 'Everyday', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  const fileHash = hash('advisor-ui');
  const doc: Document = {id: hash(JSON.stringify(['a', fileHash])), hash: fileHash, fileName: 's.csv', parser: 'synthetic', context, opening: '10000', closing: String(10000 - 450 - 900),
    payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A', rows: [raw('0', '2026-02-03', 'CAFE LUNA', '4.50'), raw('1', '2026-02-05', 'MYSTERY CO', '9.00')]};
  await state.repo.imports.stage(doc);
  for (const {row, blocked} of (await state.repo.imports.review(doc.id)).items) if (blocked) await state.repo.imports.correct(doc.id, row.sourceId, row, false);
  await state.repo.imports.commit(doc.id);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('marks rows Claude sorted, and one correction covers the whole merchant', async () => {
  const cafe = (await state.repo!.imports.ledger()).find(r => r.description === 'CAFE LUNA')!;
  await state.repo!.aiCategories.applyRun([{key: cafe.merchant, category: 'Coffee & snacks', confidence: 'high'}], 'claude-opus-5');
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={() => undefined}/></QueryClientProvider>);
  const marks = await screen.findAllByLabelText('Sorted by Kairos AI');
  expect(marks.filter(m => m.matches('svg.kai-mark'))).toHaveLength(1);
  fireEvent.click(screen.getAllByRole('button').find(b => b.classList.contains('transaction-row') && b.textContent?.includes('CAFE LUNA'))!);
  fireEvent.change(await screen.findByLabelText('Category'), {target: {value: 'Eating out'}});
  fireEvent.click(screen.getByRole('button', {name: 'All from this merchant'}));
  await screen.findByRole('button', {name: 'Saved for this merchant'});
  const row = (await state.repo!.imports.ledger()).find(r => r.description === 'CAFE LUNA')!;
  expect([row.category, row.categoryFrom]).toEqual(['Eating out', undefined]);
});

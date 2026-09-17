// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';
import {DoubleCounted} from '../src/ui/design/DoubleCounted';

const state = vi.hoisted(() => ({repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown>}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; }})}));

const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD',
  period: {start: '2026-01-01', end: '2026-01-31'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};

/** The statement that carries the same purchase he already typed in. */
const statement = (): Document => ({id: hash(JSON.stringify(['a', hash('file')])), hash: hash('file'),
  fileName: 'synthetic.csv', parser: 'synthetic', context, opening: '10000', closing: '9000', payslip: null,
  rows: [{...normalizeRow({sourceId: '1', date: '2026-01-02', description: 'Synthetic store',
    amount: '-10.00', confidence: 10000}, context), category: 'Shopping', verified: true}]});

beforeEach(async () => {
  const {driver} = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({id: 'a', name: 'Synthetic', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
});
afterEach(cleanup);

const open = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
  <DoubleCounted onReview={() => undefined}/></QueryClientProvider>);

const byHand = (id: string, description: string) => state.repo!.manual.save({id, kind: 'expense', accountId: 'a',
  destinationId: null, date: '2026-01-02', minor: '1000', description, category: 'Eating out', notes: ''});

/** Nothing to match, nothing to warn about: a notice with no occasion is noise. */
it('says nothing when no hand-recorded transaction looks like a statement row', async () => {
  await byHand('by-hand', 'Synthetic lunch');
  open();
  await waitFor(() => expect(state.tail).toBeTruthy());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByRole('status')).toBeNull();
});

/**
 * The figure on Insights counts both until they are matched, because nothing has told the app they are
 * one purchase. That is the right answer for what it knows and the wrong one for what happened, so it
 * has to be said where the figure is.
 */
it('warns on the screen the doubled figure is on', async () => {
  await byHand('by-hand', 'Synthetic store');
  const doc = statement(); await state.repo!.imports.stage(doc); await state.repo!.imports.commit(doc.id);
  open();
  await screen.findByRole('status');
  expect(screen.getByRole('status').textContent).toContain('count those purchases twice');
  expect(screen.getByRole('button', {name: 'Review in Ledger'})).toBeTruthy();
});

it('counts them, so two is not reported as one', async () => {
  await byHand('one', 'Synthetic store');
  await byHand('two', 'Synthetic store');
  const doc = statement();
  doc.rows.push({...normalizeRow({sourceId: '2', date: '2026-01-03', description: 'Synthetic store',
    amount: '-10.00', confidence: 10000}, context), category: 'Shopping', verified: true});
  doc.closing = '8000';
  await state.repo!.imports.stage(doc); await state.repo!.imports.commit(doc.id);
  open();
  await screen.findByRole('status');
  expect(screen.getByRole('status').textContent).toContain('2 transactions you recorded by hand');
});

/** Once matched there is one purchase and one figure, so the notice has nothing left to say. */
it('goes away once the entry is matched to its statement row', async () => {
  await byHand('by-hand', 'Synthetic store');
  const doc = statement(); await state.repo!.imports.stage(doc); await state.repo!.imports.commit(doc.id);
  const [candidate] = await state.repo!.manual.candidates('by-hand');
  await state.repo!.manual.match('by-hand', candidate!.leg, candidate!.transactionId);
  open();
  await waitFor(() => expect(state.tail).toBeTruthy());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByRole('status')).toBeNull();
});

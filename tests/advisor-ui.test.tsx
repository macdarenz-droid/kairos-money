// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';
import {AdvisorSettings} from '../src/ui/advisor/AdvisorSettings';

const state = vi.hoisted(() => ({repo: undefined as Repository | undefined}));
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
const mount = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><AdvisorSettings/></QueryClientProvider>);

it('stays off until turned on, asks for the key first, keeps it on the phone and asks before sorting', async () => {
  mount();
  expect((await screen.findByRole('button', {name: 'Use Kairos AI'})).getAttribute('aria-pressed')).toBe('false');
  // Key first: nothing that needs a key shows before there is one.
  expect(screen.queryByRole('button', {name: 'Sort my categories'})).toBeNull();
  expect(screen.queryByLabelText('Model')).toBeNull();
  expect(screen.queryByText('Runs on Claude with your own Anthropic key.')).toBeNull();
  fireEvent.change(screen.getByLabelText('Anthropic API key'), {target: {value: 'sk-ant-synthetic-0123456789abcdef'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save key'}));
  await screen.findByText('Key saved on this phone');
  const sort = await screen.findByRole('button', {name: 'Sort my categories'});
  expect((sort as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', {name: 'Sort new merchants after each import'}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Runs on Claude with your own Anthropic key.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Use Kairos AI'}));
  await waitFor(() => expect(screen.getByRole('button', {name: 'Use Kairos AI'}).getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(screen.getByRole('button', {name: 'Send merchant names for sorting'}));
  await waitFor(() => expect((screen.getByRole('button', {name: 'Sort my categories'}) as HTMLButtonElement).disabled).toBe(false));
  expect(await state.repo!.advisor.key()).toBe('sk-ant-synthetic-0123456789abcdef');
});

it('shows what is sent, sorts, and offers unsure answers to check', async () => {
  await state.repo!.advisor.save({enabled: true, model: 'claude-haiku-4-5', merchantNames: false, sortConsent: true, autoSort: false});
  await state.repo!.advisor.setKey('sk-ant-synthetic-0123456789abcdef');
  vi.stubGlobal('fetch', async (_: unknown, init?: RequestInit) => {
    const asked = (JSON.parse((JSON.parse(String(init?.body)) as {messages: {content: string}[]}).messages[0]!.content) as {merchants: {id: string; description: string}[]}).merchants;
    const answers = asked.map(m => m.description === 'CAFE LUNA' ? {id: m.id, category: 'Coffee & snacks', confidence: 'high'} : {id: m.id, category: 'Shopping', confidence: 'low'});
    return new Response(JSON.stringify({id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', stop_reason: 'end_turn', stop_sequence: null,
      usage: {input_tokens: 500, output_tokens: 60}, content: [{type: 'text', text: JSON.stringify({answers})}]}), {status: 200, headers: {'content-type': 'application/json'}});
  });
  mount();
  fireEvent.click(await screen.findByRole('button', {name: 'Sort my categories'}));
  await screen.findByText(/^2 merchants · about/);
  fireEvent.click(screen.getByRole('button', {name: 'See exactly what is sent'}));
  const sent = screen.getByLabelText('What is sent').textContent ?? '';
  expect(sent).toContain('CAFE LUNA');
  expect(sent).not.toContain('2026-02');
  fireEvent.click(screen.getByRole('button', {name: 'Start sorting'}));
  await screen.findByText('Sorted 1 merchant.');
  fireEvent.click(await screen.findByRole('button', {name: 'Use Shopping'}));
  await waitFor(() => expect(screen.queryByRole('button', {name: 'Use Shopping'})).toBeNull());
  const categories = (await state.repo!.imports.ledger()).map(r => [r.description, r.category]).sort();
  expect(categories).toEqual([['CAFE LUNA', 'Coffee & snacks'], ['MYSTERY CO', 'Shopping']]);
  fireEvent.click(await screen.findByRole('button', {name: 'Undo'}));
  expect((screen.getByRole('button', {name: 'Undoing…'}) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(screen.queryByRole('button', {name: /^Undo/})).toBeNull());
  expect((await state.repo!.imports.ledger()).find(r => r.description === 'CAFE LUNA')?.category).toBeNull();
});

it('lays each switch out as a row with a small On/Off button, and sorting as one full-width action', async () => {
  await state.repo!.advisor.setKey('sk-ant-synthetic-0123456789abcdef');
  mount();
  await screen.findByRole('button', {name: 'Sort my categories'});
  for (const name of ['Use Kairos AI', 'Send merchant names with reviews', 'Send merchant names for sorting', 'Sort new merchants after each import']) {
    const button = screen.getByRole('button', {name});
    expect(button.textContent).toBe('Off');
    expect(button.closest('.row-trailing')?.parentElement?.textContent).toContain(name);
  }
  expect(screen.getByLabelText('Model').closest('.row-trailing')).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Sort my categories'}).parentElement?.className).toBe('action-list');
});

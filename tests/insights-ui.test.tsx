// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {currency} from '../src/core/money';
import {localDay} from '../src/ingest/reminders';
import type {Snapshot, Transaction} from '../src/intelligence/model';
import {brainInputs} from './brain-mock';

const AUD = currency('AUD'), today = localDay();
const back = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
const ledger = vi.hoisted(() => ({cancellations: [] as unknown[], transactions: [] as Transaction[], reads: 0, spendable: '500000'}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({
  accounts: () => Promise.resolve([{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null}]),
  displayCurrency: () => Promise.resolve('AUD'),
  cancellations: {list: () => Promise.resolve(ledger.cancellations)},
  intelligence: {inputs: () => { ledger.reads++; return Promise.resolve(brainInputs({asOf: today, currency: AUD, accountIds: ['a'], coverage: [], pays: [],
    transactions: ledger.transactions, savings: {asideMinor: '0', accountIds: [], evidence: []}} satisfies Snapshot,
    {accounts: [{id: 'a', currency: 'AUD'}], balances: [{accountId: 'a', minor: ledger.spendable}]})); }},
}))})}));
import {Insights} from '../src/ui/screens/Insights';
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
afterEach(cleanup);
const row = (id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction => ({id, accountId: 'a', date, minor, currency: AUD,
  description: 'Landlord', category: 'Housing', kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over});
const month = () => [0, 1, 2].flatMap(n => [row(`pay${n}`, back(89 - n * 30), '300000', {kind: 'income', category: 'Salary', description: 'Employer'}),
  row(`rent${n}`, back(88 - n * 30), '-100000')]).concat(Array.from({length: 30}, (_, i) => row(`c${i}`, back(i * 2), '-450', {kind: 'discretionary', category: 'Coffee & snacks', description: 'Cafe'})));
const mount = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><Insights/></QueryClientProvider>);

it('reads the ledger once per open and shows the sections after the cut', async () => {
  ledger.transactions = month(); ledger.reads = 0; ledger.spendable = '500000';
  mount();
  await screen.findByLabelText('Where it went');
  for (const section of ['This month', 'Bills and subscriptions', 'Plan', 'Money set aside']) expect(screen.getByLabelText(section)).toBeTruthy();
  expect(ledger.reads).toBe(1);
  expect(screen.queryByText('Still learning')).toBeNull();
});

it('shows essentials and free help instead of plan and advice while things are tight', async () => {
  ledger.transactions = month().concat([row('f1', back(3), '-1500', {overdraftFee: true, category: 'Bank fees', kind: 'discretionary'}), row('f2', back(9), '-1500', {overdraftFee: true, category: 'Bank fees', kind: 'discretionary'})]);
  ledger.spendable = '1000';
  mount();
  await screen.findByText('Focus on essentials');
  expect(screen.queryByLabelText('Plan')).toBeNull();
  expect(screen.queryByLabelText('Advice')).toBeNull();
  expect(screen.getByText(/1800 007 007/)).toBeTruthy();
  // The card sits on top; the month and where it went stay readable.
  for (const section of ['This month', 'Where it went']) expect(screen.getByLabelText(section)).toBeTruthy();
  expect(screen.queryByLabelText('Money set aside')).toBeNull();
});

it('flags charges after a cancellation as possible final charges', async () => {
  ledger.transactions = month(); ledger.spendable = '500000';
  ledger.cancellations = [{merchant: 'landlord', currency: 'AUD', date: back(40), status: 'requested', note: ''}];
  mount();
  fireEvent.click(await screen.findByRole('button', {name: 'Review 1 later payment'}));
  await screen.findByText('These may be final charges. Check them with the provider.');
  expect(screen.getByText(back(28))).toBeTruthy();
  ledger.cancellations = [];
});

it('puts tracking on each bill row, names top merchants, and edits money set aside', async () => {
  ledger.transactions = month(); ledger.spendable = '500000'; ledger.cancellations = [];
  mount();
  const track = await screen.findByRole('button', {name: 'Track cancellation · Landlord'});
  expect(track.className).toContain('button-quiet');
  expect(track.closest('.row')?.textContent).toContain('Landlord');
  expect(screen.getByRole('heading', {name: 'Top merchants'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Edit money set aside'}).textContent).toBe('Edit');
  expect(screen.getByLabelText('This month').querySelectorAll('h2, h3')).toHaveLength(1);
  fireEvent.click(track);
  expect(await screen.findByRole('dialog', {name: 'Cancellation record'})).toBeTruthy();
});

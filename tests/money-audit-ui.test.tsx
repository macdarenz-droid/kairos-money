// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, within} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MoneyAudit} from '../src/ui/screens/MoneyAudit';
import {currency} from '../src/core/money';
import {localDay} from '../src/ingest/reminders';
import type {Snapshot, Transaction} from '../src/intelligence/model';

const AUD = currency('AUD');
const today = localDay();
const back = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);

const ledger = vi.hoisted(() => ({
  transactions: [] as Transaction[], balance: '0',
  debts: [] as {id: string; name: string; currency: string; balanceMinor: string; annualRateBp: string; minimumMinor: string; closedAt: string | null}[],
}));
vi.mock('../src/ui/session', () => ({
  useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({
    accounts: () => Promise.resolve([{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null}]),
    accountBalances: () => Promise.resolve([{accountId: 'a', minor: ledger.balance}]),
    displayCurrency: () => Promise.resolve('AUD'),
    rates: () => Promise.resolve([]),
    debts: {list: () => Promise.resolve(ledger.debts)},
    intelligence: {analyse: () => Promise.resolve({buffer: '0', snapshot: {
      asOf: today, currency: AUD, accountIds: ['a'], coverage: [], pays: [],
      transactions: ledger.transactions, savings: {asideMinor: '0', accountIds: [], evidence: []},
    } satisfies Snapshot})},
  }))}),
}));

function row(id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction {
  return {id, accountId: 'a', date, minor, currency: AUD, description: 'Synthetic', category: 'Groceries',
    kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over};
}
const household = () => [
  row('g-first', back(89), '-12000'),
  ...[84, 70, 56, 42, 28, 14].map((d, i) => row(`pay${i}`, back(d), '200000', {kind: 'income', category: 'Salary'})),
  ...[80, 50, 20].map((d, i) => row(`rent${i}`, back(d), '-120000', {category: 'Housing'})),
  ...Array.from({length: 40}, (_, i) => row(`coffee${i}`, back(1 + i), '-450', {kind: 'discretionary', category: 'Coffee & snacks'})),
];
const show = async () => {
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyAudit/></QueryClientProvider>);
  return screen.findByLabelText('Money audit');
};
afterEach(cleanup);

it('draws the audit as figures and lengths, in the currency on show', async () => {
  ledger.transactions = household(); ledger.balance = '50000';
  ledger.debts = [{id: 'card', name: 'Synthetic card', currency: 'AUD', balanceMinor: '500000', annualRateBp: '1999', minimumMinor: '15000', closedAt: null}];
  const card = await show();
  // The month: keep, save, spend, cut — and a fifth of $4,000 kept.
  expect(within(card).getByText('Each month')).toBeTruthy();
  expect(within(card).getByText('$800.00')).toBeTruthy();
  // The leaks and the debt, ranked by the year.
  expect(within(card).getByText('A year of this')).toBeTruthy();
  expect(within(card).getByText('Debt interest')).toBeTruthy();
  expect(within(card).getByText('Small purchases')).toBeTruthy();
  // Both orderings, the cheaper one marked.
  expect(within(card).getByText('Highest rate first')).toBeTruthy();
  expect(within(card).getByText('Smallest first')).toBeTruthy();
  // The roadmap, with where this ledger stands marked "now".
  expect(within(card).getByText('One month buffer').closest('.audit-step')!.getAttribute('data-status')).toBe('now');
  expect(within(card).getByText('High-interest debt').closest('.audit-step')!.getAttribute('data-status')).toBe('later');
  // No sentences: nothing on the card explains itself.
  expect(card.textContent).not.toMatch(/\. [A-Z]/);
});

it('renders nothing at all before four weeks of history', async () => {
  ledger.transactions = [row('one', back(2), '-1000')]; ledger.balance = '0'; ledger.debts = [];
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyAudit/></QueryClientProvider>);
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(screen.queryByLabelText('Money audit')).toBeNull();
});

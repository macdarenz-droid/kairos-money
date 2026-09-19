// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, within} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MoneyAudit} from '../src/ui/screens/MoneyAudit';
import {SavingsPath} from '../src/ui/design/SavingsPath';
import {currency} from '../src/core/money';
import {localDay} from '../src/ingest/reminders';
import {addMonths} from '../src/intelligence/debt';
import type {Snapshot, Transaction} from '../src/intelligence/model';

/** "try to keep ($) amount of money, to add to your savings for debt repayment" — drawn, per pay and per day. */
const AUD = currency('AUD');
const today = localDay();
const back = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
const ledger = vi.hoisted(() => ({ transactions: [] as Transaction[], debts: [] as unknown[] }));
vi.mock('../src/ui/session', () => ({
  useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({
    accounts: () => Promise.resolve([{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null}]),
    accountBalances: () => Promise.resolve([{accountId: 'a', minor: '50000'}]),
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
afterEach(cleanup);
const client = () => new QueryClient({defaultOptions: {queries: {retry: false}}});

it('shows a dated debt as an amount to keep each day, on Insights and on Today', async () => {
  ledger.transactions = [
    row('g-first', back(89), '-12000'),
    ...[84, 70, 56, 42, 28, 14].map((d, i) => row(`pay${i}`, back(d), '200000', {kind: 'income', category: 'Salary'})),
    ...[80, 50, 20].map((d, i) => row(`rent${i}`, back(d), '-120000', {category: 'Housing'})),
    ...Array.from({length: 40}, (_, i) => row(`coffee${i}`, back(1 + i), '-450', {kind: 'discretionary', category: 'Coffee & snacks'})),
  ];
  const date = addMonths(today, 10);
  ledger.debts = [{id: 'loan', name: 'Synthetic loan', currency: 'AUD', balanceMinor: '700000', annualRateBp: '0', minimumMinor: '0', closedAt: null, targetDate: date}];
  render(<QueryClientProvider client={client()}><MoneyAudit/></QueryClientProvider>);
  const card = await screen.findByLabelText('Money audit');
  expect(within(card).getByText('Pay off by')).toBeTruthy();
  const step = within(card).getByText('Synthetic loan').closest('.audit-step')!;
  expect(step.getAttribute('data-status')).toBe('now');
  expect(within(step as HTMLElement).getByText('$700.00 a month')).toBeTruthy();
  expect(within(step as HTMLElement).getByText(/\$23\.33 a day/)).toBeTruthy();
  cleanup();
  render(<QueryClientProvider client={client()}><SavingsPath/></QueryClientProvider>);
  await screen.findByLabelText('Savings');
  expect(await screen.findByText(`Keep $23.33 a day · Synthetic loan by ${date}`)).toBeTruthy();
});

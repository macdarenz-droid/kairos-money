// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {SavingsPath} from '../src/ui/design/SavingsPath';
import {currency} from '../src/core/money';
import {localDay} from '../src/ingest/reminders';
import type {Snapshot, Transaction} from '../src/intelligence/model';

const PHP = currency('PHP');
const today = localDay();
const back = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);

const ledger = vi.hoisted(() => ({transactions: [] as Transaction[], accounts: [] as {id: string; name: string; type: string; currency: string; archived_at: string | null}[], balances: [] as {accountId: string; minor: string}[]}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({
  accounts: () => Promise.resolve(ledger.accounts),
  accountBalances: () => Promise.resolve(ledger.balances),
  displayCurrency: () => Promise.resolve('PHP'),
  rates: () => Promise.resolve([]),
  intelligence: {analyse: () => Promise.resolve({buffer: '0', snapshot: {
    asOf: today, currency: PHP, accountIds: ['a'], coverage: [], pays: [],
    transactions: ledger.transactions, savings: {asideMinor: '0', accountIds: ['s'], evidence: []},
  } satisfies Snapshot})},
}))})}));
afterEach(cleanup);

const spend = (id: string, date: string, minor: string): Transaction => ({id, accountId: 'a', date, minor,
  currency: PHP, description: 'Synthetic shop', category: 'Groceries', kind: 'essential',
  status: 'settled', transfer: false, recurring: false});

function show() {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
    <SavingsPath/></QueryClientProvider>);
}

/** A chart of nothing is still a thing on the screen, and advice from four days of data is a guess. */
it('draws nothing until there is a week of history to advise on', async () => {
  ledger.accounts = [{id: 'a', name: 'Everyday', type: 'checking', currency: 'PHP', archived_at: null}];
  ledger.balances = [{accountId: 'a', minor: '5000000'}];
  ledger.transactions = [spend('one', back(2), '-100000')];
  const {container} = show();
  await waitFor(() => expect(container.querySelector('.savings-path')).toBeNull());
});

/**
 * "you can safely spend today $$$" and "keep or save 20$ today cause you have enough for your bills".
 * Two figures, one line, and no sentence anywhere near them.
 */
it('shows what can be spent today, what to keep, and where keeping it leads', async () => {
  ledger.accounts = [
    {id: 'a', name: 'Everyday', type: 'checking', currency: 'PHP', archived_at: null},
    {id: 's', name: 'Rainy day', type: 'savings', currency: 'PHP', archived_at: null},
  ];
  ledger.balances = [{accountId: 'a', minor: '5000000'}, {accountId: 's', minor: '1000000'}];
  ledger.transactions = Array.from({length: 10}, (_, i) => spend(`s${i}`, back(2 + i * 2), '-100000'));
  show();
  await screen.findByLabelText('Savings');
  expect(screen.getByText('Spend today')).toBeTruthy();
  expect(screen.getByText('Keep today')).toBeTruthy();
  // The pot is where the line stands today, and it is the savings account rather than the everyday one.
  expect(document.querySelector('.savings-path')!.textContent).toContain('10,000.00');
  // Both lines exist: what was kept, and where keeping the suggestion leads.
  expect(document.querySelector('.savings-kept')!.getAttribute('points')).toBeTruthy();
  expect(document.querySelector('.savings-planned')!.getAttribute('points')).toBeTruthy();
  // The figures are figures. Nothing explains them.
  expect(document.querySelector('.savings-path')!.textContent).not.toMatch(/because|means|recommend/i);
});

// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MoneyBand} from '../src/ui/design/MoneyBand';
import {currency} from '../src/core/money';
import {localDay} from '../src/ingest/reminders';
import type {Snapshot, Transaction} from '../src/intelligence/model';

const AUD = currency('AUD');
const today = localDay();
const back = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);

const ledger = vi.hoisted(() => ({transactions: [] as Transaction[], balances: [] as {accountId: string; minor: string}[], accounts: [] as {id: string; name: string; currency: string; archived_at: string | null; opening_balance_minor: string; mask_last4: string | null}[]}));
vi.mock('../src/ui/session', () => ({
  useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({
    accounts: () => Promise.resolve(ledger.accounts),
    accountBalances: () => Promise.resolve(ledger.balances),
    intelligence: {snapshot: () => Promise.resolve({
      asOf: today, currency: AUD, accountIds: ['a'], coverage: [], pays: [],
      transactions: ledger.transactions,
    } satisfies Snapshot)},
  }))}),
}));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

function row(over: Partial<Transaction> & {id: string; date: string; minor: string}): Transaction {
  return {accountId: 'a', currency: AUD, description: 'Cafe Mika', category: 'Eating out',
    kind: 'discretionary', status: 'settled', transfer: false, recurring: false, ...over};
}
const show = async (transactions: Transaction[], balance = '100000') => {
  ledger.transactions = transactions;
  ledger.accounts = [{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null}];
  ledger.balances = [{accountId: 'a', minor: balance}];
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyBand/></QueryClientProvider>);
  await screen.findByLabelText('Your money');
};
afterEach(cleanup);

it('leads with what came in, what went out, what that left, and what is held', async () => {
  await show([
    row({id: 'pay', date: back(5), minor: '500000', kind: 'income'}),
    row({id: 'a', date: back(4), minor: '-120000'}),
  ], '380000');
  // Scoped to the tiles: the same figures appear again in the table behind the disclosure, which is the
  // accessible route to the numbers rather than a duplicate of the band.
  const tiles = document.querySelector('.money-band')!;
  expect(tiles.textContent).toContain('Money in');
  expect(tiles.textContent).toContain('$5,000.00');
  expect(tiles.textContent).toContain('Money out');
  expect(tiles.textContent).toContain('$1,200.00');
  // Left over and Balance now are both $3,800.00 here, which is the point: what moved and what is held are
  // different questions that happen to agree when the account started empty.
  expect(tiles.textContent).toContain('Left over');
  expect(tiles.textContent).toContain('Balance now');
  expect(tiles.textContent?.match(/\$3,800\.00/g)).toHaveLength(2);
});

it('names the shortfall rather than printing a minus sign', async () => {
  await show([row({id: 'a', date: back(3), minor: '-45000'})]);
  expect(screen.getByText('Short by')).toBeTruthy();
  expect(screen.queryByText('Left over')).toBeNull();
});

it('prints no change when there is nothing to compare against', async () => {
  await show([row({id: 'a', date: back(3), minor: '-45000'})]);
  expect(document.body.textContent).not.toMatch(/on the 30 days before/);
});

it('compares against the thirty days before once they have movement', async () => {
  await show([
    row({id: 'old', date: back(40), minor: '-20000'}),
    row({id: 'new', date: back(3), minor: '-30000'}),
  ]);
  expect(screen.getAllByText(/50% on the 30 days before/).length).toBeGreaterThan(0);
});

it('says when part of the figure is not on a statement yet', async () => {
  await show([row({id: 'n', date: back(2), minor: '-3000', status: 'pending'})]);
  expect(screen.getByText('Not on a statement yet')).toBeTruthy();
});

it('is absent rather than zeroed when there are no accounts yet', async () => {
  // Four zeros above the first-run prompt would be the app reporting on its own emptiness. The screen that
  // asks for an account should be the only thing on it.
  ledger.transactions = []; ledger.accounts = []; ledger.balances = [];
  const {container} = render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyBand/></QueryClientProvider>);
  await waitFor(() => expect(container.querySelector('.money-band')).toBeNull());
  expect(screen.queryByLabelText('Your money')).toBeNull();
});

it('describes itself once, behind a mark, and nowhere on the tiles', async () => {
  await show([row({id: 'a', date: back(3), minor: '-45000'})]);
  // The band explains its own rules behind the (i), not beside every figure. A tile is a label, a number
  // and at most one quiet second line.
  expect(screen.getByLabelText('What Your money means')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/Thirty days up to/);
});

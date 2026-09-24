// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MoneyBand} from '../src/ui/design/MoneyBand';
import {currency} from '../src/core/money';
import {localDay} from '../src/ingest/reminders';
import type {Snapshot, Transaction} from '../src/intelligence/model';
import {holdingsFrom} from '../src/ledger/holdings';

const AUD = currency('AUD');
const today = localDay();
const back = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);

const ledger = vi.hoisted(() => ({transactions: [] as Transaction[], balances: [] as {accountId: string; minor: string}[], display: 'AUD', rates: [] as {asOf: string; base: string; quote: string; rateE8: string; source: string}[], accounts: [] as {id: string; name: string; type?: string; currency: string; archived_at: string | null; opening_balance_minor: string; mask_last4: string | null}[], aside: '0'}));
vi.mock('../src/ui/session', () => ({
  useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({
    accounts: () => Promise.resolve(ledger.accounts),
    accountBalances: () => Promise.resolve(ledger.balances),
    displayCurrency: () => Promise.resolve(ledger.display),
    rates: () => Promise.resolve(ledger.rates),
    // The band reads the screen's one brain, built from these inputs, rather than a pass of its own.
    intelligence: {inputs: () => {
      const code = currency(ledger.display);
      const rates = ledger.rates.map(r => ({...r, base: currency(r.base), quote: currency(r.quote), rateE8: BigInt(r.rateE8)}));
      return Promise.resolve({snapshot: {asOf: today, currency: code, accountIds: ['a'], coverage: [], pays: [],
        transactions: ledger.transactions, savings: {asideMinor: ledger.aside, accountIds: [], evidence: []}} satisfies Snapshot,
        holdings: holdingsFrom(ledger.accounts, ledger.balances, rates, code, today), bufferMinor: '0', debts: [], scheduled: [],
        cancelled: new Set<string>(), dismissals: {}});
    }},
  }))}),
}));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

function row(over: Partial<Transaction> & {id: string; date: string; minor: string}): Transaction {
  return {accountId: 'a', currency: AUD, description: 'Cafe Mika', category: 'Eating out',
    kind: 'discretionary', status: 'settled', transfer: false, recurring: false, ...over};
}
const show = async (transactions: Transaction[], balance = '100000') => {
  ledger.transactions = transactions; ledger.display = 'AUD'; ledger.rates = []; ledger.aside = '0';
  ledger.accounts = [{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null}];
  ledger.balances = [{accountId: 'a', minor: balance}];
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyBand/></QueryClientProvider>);
  await screen.findByLabelText('Your money');
};
afterEach(cleanup);

/**
 * HIS LAYOUT, from the marked screenshot: "Short by" crossed out with "remove", "move up" beside Money
 * out, "put savings display" in the space it left. Four questions, and the one he struck out was the
 * only one that was arithmetic on the other two.
 */
it('leads with what went out, what came in, what is kept, and what is left to spend', async () => {
  await show([
    row({id: 'pay', date: back(5), minor: '500000', kind: 'income'}),
    row({id: 'a', date: back(4), minor: '-120000'}),
  ], '380000');
  const tiles = document.querySelector('.money-band')!;
  const labels = [...tiles.querySelectorAll('.band-label')].map(l => l.textContent);
  expect(labels).toEqual(['Money out', 'Money in', 'Savings', 'Balance now']);
  expect(tiles.textContent).toContain('$5,000.00');
  expect(tiles.textContent).toContain('$1,200.00');
  expect(tiles.textContent).toContain('$3,800.00');
  // The figure that was the difference between the other two is gone, not moved.
  expect(tiles.textContent).not.toContain('Left over');
  expect(tiles.textContent).not.toContain('Short by');
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

/**
 * FROM HIS SCREEN. "Balance now PHP 0.00" sat beside an account holding A$116, because this one line
 * kept only the accounts whose currency already matched the one being displayed. Everything else had
 * been taught to convert; this had not, so the tiles reported what MOVED correctly and what he HAS as
 * nothing at all.
 */
it('converts what each account holds instead of dropping the ones in another currency', async () => {
  ledger.display = 'PHP';
  ledger.rates = [{asOf: '2026-01-01', base: 'PHP', quote: 'AUD', rateE8: '2380952', source: 'manual'}];
  ledger.transactions = [];
  ledger.accounts = [{id: 'a', name: 'G', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null}];
  ledger.balances = [{accountId: 'a', minor: '11600'}];
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyBand/></QueryClientProvider>);
  await screen.findByLabelText('Your money');
  // A$116.00 at 42 pesos to the dollar is ₱4,872.00 — not nought, and not dollars.
  await waitFor(() => expect(document.querySelector('.money-band')!.textContent).toContain('4,872.00'));
  expect(document.querySelector('.money-band')!.textContent).not.toContain('$116.00');
});

/** An account no rate reaches is left out rather than counted as nought; Unconverted names it above. */
it('leaves out an account it cannot value, rather than adding a wrong number', async () => {
  ledger.display = 'PHP'; ledger.rates = []; ledger.transactions = [];
  ledger.accounts = [{id: 'a', name: 'G', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null}];
  ledger.balances = [{accountId: 'a', minor: '11600'}];
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyBand/></QueryClientProvider>);
  await screen.findByLabelText('Your money');
  expect(document.querySelector('.money-band')!.textContent).not.toContain('116');
});

/**
 * "savings money doesnt mix in overall balance. its a separate money." A savings account was counted in
 * the same figure as the money he can spend, which is the one mistake a money app must not make: the
 * number he reads as spendable would have included what he had deliberately put out of reach.
 */
it('keeps savings out of what is spendable, and counts what was set aside without an account', async () => {
  ledger.transactions = []; ledger.display = 'AUD'; ledger.rates = [];
  ledger.accounts = [
    {id: 'a', name: 'Everyday', type: 'checking', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null},
    {id: 's', name: 'Rainy day', type: 'savings', currency: 'AUD', archived_at: null, opening_balance_minor: '0', mask_last4: null},
  ];
  ledger.balances = [{accountId: 'a', minor: '120000'}, {accountId: 's', minor: '500000'}];
  // Money kept with no savings account to keep it in: a Savings-categorised purchase the ledger counted.
  ledger.aside = '25000';
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MoneyBand/></QueryClientProvider>);
  await screen.findByLabelText('Your money');
  const tiles = document.querySelector('.money-band')!;
  // Spendable is the everyday account alone; savings is the pot plus the amount set aside.
  expect(tiles.textContent).toContain('$1,200.00');
  expect(tiles.textContent).toContain('$5,250.00');
  expect(tiles.textContent).not.toContain('$6,450.00');
  // And the account count beside Balance now counts the accounts that figure is about.
  expect(tiles.textContent).toContain('1 account');
});

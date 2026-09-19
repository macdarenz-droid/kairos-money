// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {Rates} from '../src/ui/screens/Rates';

const state = vi.hoisted(() => ({repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown>}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; }})}));

beforeEach(async () => {
  const {driver} = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({id: 'a', name: 'Test', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  await state.repo.setDisplayCurrency('PHP');
  await state.repo.manual.save({id: 'g', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '10000', description: 'G', category: 'Eating out', notes: ''});
});
afterEach(cleanup);

/** Wait for the stored setting to load, or the screen is still showing its default. */
async function open(shown = 'PHP') {
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
    <Rates accounts={await state.repo!.accounts()} notify={() => undefined}/></QueryClientProvider>);
  await waitFor(() => expect((screen.getByLabelText('Show amounts in') as HTMLSelectElement).value).toBe(shown));
}

/**
 * The rate service is unreachable from his phone and I cannot see why from here. Waiting on somebody
 * else's uptime to show him his own money in his own currency is the app holding his data hostage. A
 * rate is one number, and he knows it.
 */
it('lets him type the rate himself and converts his ledger with it', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('1 AUD in PHP'), {target: {value: '38'}});
  fireEvent.click(screen.getByRole('button', {name: 'Use my own rate'}));
  await waitFor(async () => expect((await state.repo!.rates()).length).toBe(1));

  // A$100.00 at 38 pesos to the dollar is ₱3,800.00, exact and integer throughout.
  const snapshot = await state.repo!.intelligence.snapshot('2026-01-31', 'PHP');
  expect(snapshot.transactions[0]!.minor).toBe('-380000');
  expect(snapshot.unconverted).toBeUndefined();
});

/**
 * Dated at the ledger's FIRST day, not today. A conversion uses the newest rate on or before a date, so
 * one dated today would convert nothing older than today — which is the whole ledger.
 */
it('applies to money recorded before he typed it', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('1 AUD in PHP'), {target: {value: '38'}});
  fireEvent.click(screen.getByRole('button', {name: 'Use my own rate'}));
  await waitFor(async () => expect((await state.repo!.rates())[0]?.asOf).toBe('2026-01-20'));
});

/** Kept as his, beside the published ones and never mistakable for one. */
it('records it as his own figure rather than a published one', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('1 AUD in PHP'), {target: {value: '38'}});
  fireEvent.click(screen.getByRole('button', {name: 'Use my own rate'}));
  await waitFor(async () => expect((await state.repo!.rates())[0]?.source).toBe('manual'));
});

/** An empty box is not a rate of nought; it says what is missing. */
it('asks for a number rather than saving nothing', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', {name: 'Use my own rate'}));
  expect((await screen.findByRole('alert')).textContent).toContain('how many PHP one AUD is worth');
  expect(await state.repo!.rates()).toEqual([]);
});

/** Nothing to enter when the money is already in the currency being shown. */
it('offers no box when there is nothing to convert', async () => {
  await state.repo!.setDisplayCurrency('AUD');
  await open('AUD');
  expect(screen.queryByRole('button', {name: 'Use my own rate'})).toBeNull();
});

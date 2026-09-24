// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {Unconverted} from '../src/ui/design/Unconverted';

const state = vi.hoisted(() => ({repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown>}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; }})}));

beforeEach(async () => {
  const {driver} = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({id: 'a', name: 'Everyday', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
});
afterEach(cleanup);

const open = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
  <Unconverted onFix={() => undefined}/></QueryClientProvider>);
const settle = async () => { await waitFor(() => expect(state.tail).toBeTruthy()); await new Promise(r => setTimeout(r, 0)); };

/**
 * The snapshot already excluded money it had no rate for, which is the honest handling — counting it as
 * zero or passing it through unconverted both invent a number. Nothing read that record, so the result
 * was a screen quietly showing less money than the person has, with no reason given.
 */
it('names the currency the figures had to leave out', async () => {
  await state.repo!.setDisplayCurrency('PHP');
  open();
  const notice = await screen.findByRole('status');
  expect(notice.textContent).toContain('AUD');
  expect(notice.textContent).toContain('no stored rate');
  expect(notice.textContent).toContain('PHP');
  expect(screen.getByRole('button', {name: 'Update rates'})).toBeTruthy();
});

/** Two currencies out of reach are both named; one of them is not the whole story. */
it('names every currency it left out, not just the first', async () => {
  await state.repo!.addAccount({id: 'u', name: 'Offshore', institution: '', type: 'checking',
    currency: 'USD', mask_last4: null, opening_balance_minor: 0n});
  await state.repo!.setDisplayCurrency('PHP');
  open();
  const notice = await screen.findByRole('status');
  expect(notice.textContent).toContain('AUD and USD');
});

/** With a rate reaching everything there is nothing to warn about, and a notice with no occasion is noise. */
it('says nothing once a rate reaches the money', async () => {
  await state.repo!.setDisplayCurrency('PHP');
  await state.repo!.saveRates([{asOf: '2026-01-01', base: 'PHP', quote: 'AUD', rateE8: 2640000n, source: 'synthetic'}]);
  open();
  await settle();
  expect(screen.queryByRole('status')).toBeNull();
});

/** Nothing to convert in the first place: amounts already in the chosen currency are never a gap. */
it('says nothing when the money is already in the chosen currency', async () => {
  await state.repo!.setDisplayCurrency('AUD');
  open();
  await settle();
  expect(screen.queryByRole('status')).toBeNull();
});

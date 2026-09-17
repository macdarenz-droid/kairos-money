// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {localDay} from '../src/ingest/reminders';
import {ManualHistory} from '../src/ui/screens/Manual';

const state = vi.hoisted(() => ({repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown>}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; }})}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: () => ({})}));

beforeEach(async () => {
  const {driver} = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({id: 'a', name: 'Test', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  await state.repo.setDisplayCurrency('PHP');
  await state.repo.manual.save({id: 'g', kind: 'expense', accountId: 'a', destinationId: null,
    date: localDay(), minor: '10000', description: 'G', category: 'Eating out', notes: ''});
});
afterEach(cleanup);

const open = async () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
  <ManualHistory today/></QueryClientProvider>);

/**
 * FROM HIS SCREEN. "Spent today $100.00" sat directly under tiles reading "Money out PHP 0.00" — the
 * same screen answering the same question in two currencies, because this totalled by currency and
 * printed each in its own while everything above it followed the display setting.
 */
it('shows what was recorded today in the currency the rest of the screen uses', async () => {
  await state.repo!.saveRates([{asOf: '2026-01-01', base: 'PHP', quote: 'AUD', rateE8: 2640000n, source: 'synthetic'}]);
  await open();
  // A$100.00 at 0.0264 AUD per PHP is ₱3,787.88 — one figure, in PHP, like the tiles above it.
  await waitFor(() => expect(document.body.textContent).toContain('3,787.88'));
  // Scoped to the total. The repeat chip below still says A$100.00, and should: pressing it records a
  // hundred Australian dollars into an Australian account, not its value in pesos.
  expect(screen.getByText('Spent today').closest('.row')!.textContent).not.toContain('$100.00');
});

/** No rate is not an excuse to print the wrong currency: the money is named as left out instead. */
it('names money it could not convert rather than printing it in another currency', async () => {
  await open();
  await waitFor(() => expect(document.body.textContent).toContain('AUD not included'));
  expect(screen.getByText('Spent today').closest('.row')!.textContent).not.toContain('$100.00');
});

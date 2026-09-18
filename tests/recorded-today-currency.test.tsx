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

/**
 * HIS ACTUAL PHONE: one peso account, and "Change display currency" never opened at all.
 *
 * "still in aud. even i used php." MoneyBand already inferred PHP from the account when no setting had
 * been saved; this hook fell back to a literal 'AUD' regardless of what the account held, so the same
 * screen, at the same moment, disagreed with itself about which money it was even showing.
 */
it('shows a peso account in pesos with no display currency ever chosen', async () => {
  const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'p', name: 'Wallet', institution: '', type: 'cash',
    currency: 'PHP', mask_last4: null, opening_balance_minor: 0n});
  await repo.manual.save({id: 'g', kind: 'expense', accountId: 'p', destinationId: null,
    date: localDay(), minor: '2974', description: 'G', category: 'Eating out', notes: ''});
  state.repo = repo;
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
    <ManualHistory today/></QueryClientProvider>);
  await waitFor(() => expect(document.body.textContent).toContain('29.74'));
  // "PHP 29.74", never "$29.74" — a bare dollar sign under en-AU formatting is what AUD renders as, and
  // that means the wrong currency, not a formatting choice.
  expect(document.body.textContent).not.toContain('$29.74');
});

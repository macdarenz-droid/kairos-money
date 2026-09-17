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

/** The source answers a day it does not publish with the most recent one it does, and says which. */
const served: string[] = [];
function serve(byDay: Record<string, string>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const asked = url.pathname.slice(1);
    served.push(asked);
    const date = byDay[asked];
    if (!date) return new Response('no', {status: 404});
    return new Response(JSON.stringify({base: 'PHP', date, rates: {AUD: 0.0264}}), {status: 200});
  });
}

beforeEach(async () => {
  served.length = 0;
  const {driver} = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({id: 'a', name: 'Everyday', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  await state.repo.setDisplayCurrency('PHP');
  for (const [id, date] of [['old', '2026-01-20'], ['new', '2026-03-05']]) {
    await state.repo.manual.save({id: id!, kind: 'expense', accountId: 'a', destinationId: null,
      date: date!, minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Update is disabled until the stored display currency has loaded, so wait for it before pressing. */
async function press() {
  await waitFor(() => expect((screen.getByLabelText('Show amounts in') as HTMLSelectElement).value).toBe('PHP'));
  fireEvent.click(screen.getByRole('button', {name: /Update/}));
}
const open = async () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
  <Rates accounts={await state.repo!.accounts()} notify={() => undefined}/></QueryClientProvider>);

/**
 * A refresh asked for `latest` alone, so a conversion — which uses the newest rate published ON OR
 * BEFORE a transaction's date — had exactly one usable day. Everything older was dropped, and most of
 * the ledger disappeared from the analysis after doing the thing that was supposed to fix it.
 */
it('asks for every month the ledger spans, not just today', async () => {
  serve({latest: '2026-03-17', '2026-01-01': '2025-12-31', '2026-02-01': '2026-01-30', '2026-03-01': '2026-02-27'});
  await open();
  await press();
  await waitFor(() => expect(served).toContain('2026-03-01'), {timeout: 5000});
  expect(served[0]).toBe('latest');
  expect(served).toEqual(['latest', '2026-01-01', '2026-02-01', '2026-03-01']);
});

/** The point of all of it: a January purchase converts, where before it was dropped. */
it('leaves the oldest transaction convertible afterwards', async () => {
  serve({latest: '2026-03-17', '2026-01-01': '2025-12-31', '2026-02-01': '2026-01-30', '2026-03-01': '2026-02-27'});
  await open();
  await press();
  await waitFor(async () => expect((await state.repo!.rates()).length).toBeGreaterThan(3), {timeout: 5000});
  const snapshot = await state.repo!.intelligence.snapshot('2026-03-31', 'PHP');
  expect(snapshot.transactions).toHaveLength(2);
  expect(snapshot.unconverted).toBeUndefined();
});

/** A month the source cannot answer is not a failed refresh; what did arrive is worth keeping. */
it('keeps the months that arrived when one of them fails', async () => {
  serve({latest: '2026-03-17', '2026-01-01': '2025-12-31', '2026-03-01': '2026-02-27'});
  await open();
  await press();
  await waitFor(() => expect(served).toContain('2026-03-01'), {timeout: 5000});
  await waitFor(async () => expect((await state.repo!.rates()).length).toBeGreaterThan(0), {timeout: 5000});
  expect(screen.queryByRole('alert')).toBeNull();
});

/** Today failing is a failed refresh, and says so rather than pretending. */
it('reports a refresh that could not reach the source at all', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  await open();
  await press();
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach api\.frankfurter\.dev/);
});

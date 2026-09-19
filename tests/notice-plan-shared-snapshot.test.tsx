// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {currency} from '../src/core/money';
import {localDay} from '../src/ingest/reminders';
import {noticeKinds} from '../src/intelligence/notifications';
import type {Snapshot} from '../src/intelligence/model';
import {NotificationSync} from '../src/ui/screens/Notifications';

/**
 * The reminder plan and the Today cards want the same ledger snapshot. On the device gate the two full
 * reads, started together at unlock, held the 20,000-row History load at the edge of its budget. The
 * plan now reads the display currency's analysis through Today's own query key, so the ledger is paged
 * once; only an account held in another currency costs a snapshot of its own.
 */
const spies = vi.hoisted(() => ({analyse: vi.fn(), snapshot: vi.fn(), notices: vi.fn(async () => undefined)}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: () => ({notices: spies.notices})}));
vi.mock('../src/intelligence/notifications', async (importOriginal) => ({...await importOriginal<typeof import('../src/intelligence/notifications')>(), notificationPlan: () => []}));
const today = localDay();
const snapshot = (code: string): Snapshot => ({asOf: today, currency: currency(code), accountIds: ['a'], coverage: [], pays: [], transactions: [], savings: {asideMinor: '0', accountIds: [], evidence: []}});
vi.mock('../src/ui/session', () => ({
  useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({
    accounts: () => Promise.resolve([{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null}, {id: 'p', name: 'Wallet', currency: 'PHP', archived_at: null}]),
    displayCurrency: () => Promise.resolve('AUD'),
    notifications: {preferences: () => Promise.resolve(Object.fromEntries(noticeKinds.map(k => [k, true])))},
    intelligence: {
      analyse: (...args: unknown[]) => { spies.analyse(...args); return Promise.resolve({buffer: '0', snapshot: snapshot('AUD')}); },
      snapshot: (...args: unknown[]) => { spies.snapshot(...args); return Promise.resolve(snapshot(String(args[1]))); },
    },
  }))}),
}));
afterEach(cleanup);

it('reads the displayed currency through the analysis Today already runs, and snapshots only the other currency', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><NotificationSync/></QueryClientProvider>);
  await waitFor(() => expect(spies.notices).toHaveBeenCalled());
  expect(spies.analyse).toHaveBeenCalledTimes(1);
  expect(spies.analyse).toHaveBeenCalledWith(today, 'AUD', '0', 0);
  expect(spies.snapshot).toHaveBeenCalledTimes(1);
  expect(spies.snapshot).toHaveBeenCalledWith(today, 'PHP');
  // The analysis now sits under Today's key: a card mounting next reads it, it is not fetched again.
  expect(client.getQueryData(['intelligence', today, 'AUD', {extra: '0', cut: 0}])).toMatchObject({snapshot: {currency: 'AUD'}});
});

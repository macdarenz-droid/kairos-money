// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

const native = vi.hoisted(() => ({request: vi.fn(), status: vi.fn(), notices: vi.fn(async () => undefined)}));
const box = vi.hoisted(() => ({state: 'ready', saved: [] as Record<string, boolean>[], prefs: {bill: false, unusual: false, price: false, digest: false}}));
vi.mock('@capacitor/core', async original => ({...(await original<object>()), Capacitor: {isNativePlatform: () => true}}));
vi.mock('../src/ingest/reminders', () => ({Reminder: native, localDay: () => '2026-08-26'}));
vi.mock('../src/ui/currency', () => ({useDisplayCurrencyState: () => ({code: 'AUD', settled: true})}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: box.state, run: async (fn: (repo: unknown) => Promise<unknown>) => {
  if (box.state !== 'ready') throw new Error('Unlock the Android app to access your ledger.');
  return fn({accounts: async () => [], notifications: {preferences: async () => box.prefs,
    save: async (next: typeof box.prefs) => { box.prefs = next; box.saved.push(next); }}});
}})}));
const {NotificationSettings, NotificationSync} = await import('../src/ui/screens/Notifications');

const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
const ui = () => <QueryClientProvider client={client}><NotificationSync/><NotificationSettings/></QueryClientProvider>;
const deferred = () => { let resolve!: (v: {granted: boolean}) => void; const promise = new Promise<{granted: boolean}>(r => { resolve = r; }); return {promise, resolve}; };
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

beforeEach(() => { box.state = 'ready'; box.saved = []; box.prefs = {bill: false, unusual: false, price: false, digest: false}; client.clear(); localStorage.clear(); native.request.mockReset(); native.status.mockReset(); });
afterEach(cleanup);

/** Android's prompt pauses the app, which closes the ledger until it is back in front. */
async function leaveAndReturn(view: ReturnType<typeof render>, answer: () => void) {
  box.state = 'background'; view.rerender(ui()); await flush();
  answer(); await flush();
  box.state = 'ready'; view.rerender(ui()); await flush();
}

it('turns the switch on after Android grants the permission, without a second try', async () => {
  const prompt = deferred(); native.request.mockReturnValue(prompt.promise); native.status.mockResolvedValue({granted: true});
  const view = render(ui()); await flush();
  fireEvent.click(await screen.findByRole('button', {name: 'Upcoming bills'}));
  await leaveAndReturn(view, () => prompt.resolve({granted: true}));
  expect(box.saved).toEqual([{bill: true, unusual: false, price: false, digest: false}]);
  expect(screen.getByRole('button', {name: 'Upcoming bills'}).getAttribute('aria-pressed')).toBe('true');
});

it('turns the switch on when the owner grants it in settings and comes back', async () => {
  native.request.mockResolvedValue({granted: false});
  const view = render(ui()); await flush();
  fireEvent.click(await screen.findByRole('button', {name: 'Monthly review'})); await flush();
  expect(box.saved).toEqual([]);
  native.status.mockResolvedValue({granted: true});
  await leaveAndReturn(view, () => undefined);
  expect(box.saved).toEqual([{bill: false, unusual: false, price: false, digest: true}]);
});

it('leaves the switch off and says why when the permission is still missing', async () => {
  native.request.mockResolvedValue({granted: false}); native.status.mockResolvedValue({granted: false});
  const view = render(ui()); await flush();
  fireEvent.click(await screen.findByRole('button', {name: 'Recurring price changes'})); await flush();
  await leaveAndReturn(view, () => undefined);
  expect(box.saved).toEqual([]);
  const note = screen.getByText(/stays off/).textContent!;
  expect(note.trim().split(/\s+/).length).toBeLessThanOrEqual(12);
  // Settled once: a later return to the app does not keep re-checking a switch nobody asked for.
  native.status.mockClear(); await leaveAndReturn(view, () => undefined);
  expect(native.status).not.toHaveBeenCalled();
});

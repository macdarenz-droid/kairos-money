// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import App from '../src/ui/App';
import {SessionProvider} from '../src/ui/session';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import type {Notice} from '../src/ingest/notices';

const store = vi.hoisted(() => ({held: [] as Notice[], forgetCalls: [] as string[][]}));
const native = vi.hoisted(() => ({unlocked: false, repo: undefined as Repository | undefined}));
const app = vi.hoisted(() => ({listeners: {} as Record<string, (e?: unknown) => void>}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: (name: string) => name === 'KairosNotices' ? {
  captured: async () => ({notices: store.held.map(n => ({...n}))}),
  forget: async ({ids}: {ids: string[]}) => { store.forgetCalls.push(ids); store.held = store.held.filter(n => !ids.includes(n.id)); },
} : {}}));
vi.mock('@capacitor/app', () => ({App: {addListener: async (event: string, fn: (e?: unknown) => void) => { app.listeners[event] = fn; return {remove() {}}; }}}));
vi.mock('../src/core/db/native', () => ({openDatabase: async () => native.repo, closeDatabase: async () => {}, deleteDatabase: async () => {}, serial: async <T,>(fn: () => Promise<T>) => fn()}));
vi.mock('../src/core/crypto/native', () => ({Vault: {
  status: async () => ({configured: true, unlocked: native.unlocked, biometric: true, biometricEnabled: true, backupCodeRequired: false}),
  unlock: async () => { native.unlocked = true; }, authenticate: async () => { native.unlocked = true; },
  lock: async () => { native.unlocked = false; }, setTheme: async () => {},
}}));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

// Readable and unanswered: the owner cleared the shade question instead of tapping Yes or No.
const PURCHASE: Notice = {id: 'notice:1790000000:aa', source: 'com.commbank.netbank', title: 'CommBank', decision: null,
  postedAt: Date.parse('2026-09-25T02:30:00Z'), text: 'You spent $12.50 at WOOLWORTHS 1234.'};

beforeEach(async () => {
  native.unlocked = false; app.listeners = {};
  window.matchMedia = vi.fn().mockReturnValue({matches: false, addEventListener() {}, removeEventListener() {}});
  const {driver} = memoryDriver(); await migrate(driver); native.repo = repository(driver);
  await native.repo.addAccount({id: 'wbc', name: 'Westpac', institution: 'Westpac', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  await native.repo.addAccount({id: 'cba', name: 'CommBank', institution: 'CommBank', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  store.held = [{...PURCHASE}]; store.forgetCalls = [];
});
afterEach(cleanup);

const mount = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><SessionProvider><App/></SessionProvider></QueryClientProvider>);
const unlock = async () => {
  fireEvent.change(await screen.findByLabelText('PIN'), {target: {value: '246810'}});
  fireEvent.click(screen.getByRole('button', {name: 'Unlock'}));
  await screen.findByRole('navigation');
};
const settle = () => act(() => new Promise(r => setTimeout(r, 400)));

const lockAndUnlock = async () => {
  await act(async () => { app.listeners.appStateChange?.({isActive: false}); });
  native.unlocked = false;
  await act(async () => { app.listeners.appStateChange?.({isActive: true}); });
  await unlock(); await settle();
};

it('shows a waiting purchase again after a quick background and resume', async () => {
  mount(); await unlock();
  await screen.findByText('WOOLWORTHS 1234');
  await act(async () => { app.listeners.appStateChange?.({isActive: false}); });
  await act(async () => { app.listeners.appStateChange?.({isActive: true}); });
  await screen.findByRole('navigation'); await settle();
  expect(screen.queryByText('WOOLWORTHS 1234')).not.toBeNull();
});

it('offers a Today button that reopens the sheet after Done, lock and unlock', async () => {
  mount(); await unlock();
  await screen.findByText('WOOLWORTHS 1234');
  fireEvent.click(screen.getByRole('button', {name: 'Done'}));
  await lockAndUnlock();
  fireEvent.click(await screen.findByRole('button', {name: 'Check 1 bank notice'}));
  expect(await screen.findByText('WOOLWORTHS 1234')).not.toBeNull();
});

it('does not reopen the sheet by itself after Done in the same session', async () => {
  mount(); await unlock();
  await screen.findByText('WOOLWORTHS 1234');
  fireEvent.click(screen.getByRole('button', {name: 'Done'}));
  await settle();
  expect(screen.queryByText('WOOLWORTHS 1234')).toBeNull();
  expect(screen.getByRole('button', {name: 'Check 1 bank notice'})).not.toBeNull();
});

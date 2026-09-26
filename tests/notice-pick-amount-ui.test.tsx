// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import App from '../src/ui/App';
import {SessionProvider} from '../src/ui/session';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import type {Notice} from '../src/ingest/notices';
import {localDay} from '../src/ingest/reminders';

// The native NoticeStore as the app sees it: captured() returns what is held, forget() removes by id.
const store = vi.hoisted(() => ({held: [] as Notice[], forgetCalls: [] as string[][]}));
const native = vi.hoisted(() => ({unlocked: false, repo: undefined as Repository | undefined}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: (name: string) => name === 'KairosNotices' ? {
  captured: async () => ({notices: store.held.map(n => ({...n}))}),
  forget: async ({ids}: {ids: string[]}) => { store.forgetCalls.push(ids); store.held = store.held.filter(n => !ids.includes(n.id)); },
} : {}}));
vi.mock('@capacitor/app', () => ({App: {addListener: async () => ({remove() {}})}}));
vi.mock('../src/core/db/native', () => ({openDatabase: async () => native.repo, closeDatabase: async () => {}, deleteDatabase: async () => {}, serial: async <T,>(fn: () => Promise<T>) => fn()}));
vi.mock('../src/core/crypto/native', () => ({Vault: {
  status: async () => ({configured: true, unlocked: native.unlocked, biometric: true, biometricEnabled: true, backupCodeRequired: false}),
  unlock: async () => { native.unlocked = true; }, authenticate: async () => { native.unlocked = true; },
  lock: async () => { native.unlocked = false; }, setTheme: async () => {},
}}));

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

const posted = Date.parse('2026-09-25T02:30:00Z');
beforeEach(async () => {
  native.unlocked = false;
  window.matchMedia = vi.fn().mockReturnValue({matches: false, addEventListener() {}, removeEventListener() {}});
  const {driver} = memoryDriver(); await migrate(driver); native.repo = repository(driver);
  await native.repo.addAccount({id: 'cba', name: 'Synthetic Bank', institution: 'Synthetic Bank', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  store.held = [{id: 'notice:1790000000:aa', source: 'com.synthetic.bank', title: 'Synthetic Bank', decision: 'approved', postedAt: posted,
    text: 'Purchase $11.95 at SYNTHETIC FUEL, card fee $0.50.'}];
  store.forgetCalls = [];
});
afterEach(cleanup);

it('a shade Yes on a notice with two amounts records the amount the owner picks', async () => {
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><SessionProvider><App/></SessionProvider></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('PIN'), {target: {value: '246810'}});
  fireEvent.click(screen.getByRole('button', {name: 'Unlock'}));
  await screen.findByText('Check these transactions');
  expect(screen.getByRole('button', {name: 'Spent $0.50'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Add by hand'})).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', {name: 'Spent $11.95'}));
  await waitFor(() => expect(store.forgetCalls).toEqual([['notice:1790000000:aa']]));
  expect(await native.repo!.notices.records()).toMatchObject([{accountId: 'cba', minor: '-1195', merchant: 'SYNTHETIC FUEL',
    date: localDay(new Date(posted)), description: 'Purchase $11.95 at SYNTHETIC FUEL, card fee $0.50.', source: 'com.synthetic.bank'}]);
});

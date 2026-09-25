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
// Both were answered "Yes, I did" in the shade (NoticeActionReceiver -> NoticeStore.decide 'approved').
const SHADE_APPROVED: Notice[] = [
  {id: 'notice:1790000000:aa', source: 'com.commbank.netbank', title: 'CommBank', decision: 'approved', postedAt: posted,
    text: 'Purchase of $23.40 at COLES 0456 at 12.30pm.'},
  {id: 'notice:1790000100:bb', source: 'com.commbank.netbank', title: 'CommBank', decision: 'approved', postedAt: posted + 100_000,
    text: 'You spent $15.00 at CAFE MIKA. Log in to the app for details.'},
];

beforeEach(async () => {
  native.unlocked = false;
  window.matchMedia = vi.fn().mockReturnValue({matches: false, addEventListener() {}, removeEventListener() {}});
  const {driver} = memoryDriver(); await migrate(driver); native.repo = repository(driver);
  await native.repo.addAccount({id: 'wbc', name: 'Westpac', institution: 'Westpac', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  await native.repo.addAccount({id: 'cba', name: 'CommBank', institution: 'CommBank', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  store.held = SHADE_APPROVED.map(n => ({...n})); store.forgetCalls = [];
});
afterEach(cleanup);

const unlockApp = async () => {
  const view = render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><SessionProvider><App/></SessionProvider></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('PIN'), {target: {value: '246810'}});
  fireEvent.click(screen.getByRole('button', {name: 'Unlock'}));
  await screen.findByRole('navigation');
  return view;
};

it('a purchase approved in the shade that cannot be read is offered to add by hand or dismiss, after every unlock', async () => {
  for (const _round of [1, 2]) {
    const view = await unlockApp();
    await screen.findByText('Check these transactions');
    await screen.findByText('Purchase of $23.40 at COLES 0456 at 12.30pm.');
    expect(screen.getByText('You spent $15.00 at CAFE MIKA. Log in to the app for details.')).toBeTruthy();
    expect(screen.queryByText('Nothing new from your bank to check.')).toBeNull();
    expect(screen.getAllByRole('button', {name: 'Add by hand'})).toHaveLength(2);
    expect(screen.getAllByRole('button', {name: 'Dismiss'})).toHaveLength(2);
    view.unmount();
  }
  await unlockApp();
  fireEvent.click((await screen.findAllByRole('button', {name: 'Dismiss'}))[0]!);
  await waitFor(() => expect(store.forgetCalls).toEqual([['notice:1790000000:aa']]));
  fireEvent.click(await screen.findByRole('button', {name: 'Add by hand'}));
  await screen.findByRole('button', {name: 'Save transaction'});
});

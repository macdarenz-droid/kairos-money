// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import App from '../src/ui/App';
import {SessionProvider} from '../src/ui/session';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';

const native = vi.hoisted(() => ({unlocked: false, repo: undefined as Repository | undefined, unlock: vi.fn(), authenticate: vi.fn()}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: () => ({})}));
vi.mock('@capacitor/app', () => ({App: {addListener: async () => ({remove() {}})}}));
vi.mock('../src/core/db/native', () => ({openDatabase: async () => native.repo, closeDatabase: async () => {}, deleteDatabase: async () => {}, serial: async <T,>(fn: () => Promise<T>) => fn()}));
vi.mock('../src/core/crypto/native', () => ({Vault: {
  status: async () => ({configured: true, unlocked: native.unlocked, biometric: true, biometricEnabled: true, backupCodeRequired: false}),
  unlock: native.unlock, authenticate: native.authenticate, lock: async () => { native.unlocked = false; }, setTheme: async () => {},
}}));
beforeEach(async () => {
  native.unlocked = false;
  native.unlock.mockReset().mockImplementation(async () => { native.unlocked = true; });
  native.authenticate.mockReset().mockImplementation(async () => { native.unlocked = true; });
  window.matchMedia = vi.fn().mockReturnValue({matches: false, addEventListener() {}, removeEventListener() {}});
  const {driver} = memoryDriver(); await migrate(driver); native.repo = repository(driver);
});
afterEach(cleanup);
const mount = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><SessionProvider><App/></SessionProvider></QueryClientProvider>);

it('opens the ledger with the PIN alone', async () => {
  mount();
  fireEvent.change(await screen.findByLabelText('PIN'), {target: {value: '246810'}});
  fireEvent.click(screen.getByRole('button', {name: 'Unlock'}));
  await screen.findByRole('navigation');
  expect(native.unlock).toHaveBeenCalledTimes(1);
  expect(native.authenticate).not.toHaveBeenCalled();
});

it('opens the ledger with biometrics alone, no PIN', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', {name: 'Use biometrics'}));
  await screen.findByRole('navigation');
  expect(native.authenticate).toHaveBeenCalledTimes(1);
  expect(native.unlock).not.toHaveBeenCalled();
});

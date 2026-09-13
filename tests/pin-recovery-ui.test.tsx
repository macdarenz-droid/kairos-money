// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/ui/App';
import { useTheme } from '../src/ui/design/theme';
import { SessionProvider } from '../src/ui/session';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
const native = vi.hoisted(() => ({ configured: false, unlocked: false, pause: undefined as (()=>void)|undefined, listener: undefined as ((state: { isActive: boolean }) => void) | undefined, repo: undefined as Repository | undefined, erased: false, recovery: false, replaced: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_name: string, callback: (state: { isActive: boolean }) => void) => { if(_name==='pause')native.pause=()=>callback({isActive:false});else native.listener = callback; return { remove() {} }; } } }));
vi.mock('../src/core/db/native', () => ({ openDatabase: async () => native.repo, closeDatabase: async () => {}, deleteDatabase: async () => { native.erased = true; }, serial: async <T,>(fn: () => Promise<T>) => fn() }));
vi.mock('../src/core/crypto/native', () => ({ Vault: {
  status: async () => ({ configured: native.configured, unlocked: native.unlocked, biometric: false, biometricEnabled: false }),
  setup: async ({ pin, confirm }: { pin: string; confirm: string }) => { if (pin !== confirm) throw new Error('The PINs do not match.'); native.configured = true; native.unlocked = true; },
  unlock: async ({ pin }: { pin: string }) => { if (pin !== '246810') throw new Error('That PIN did not match.'); native.unlocked = true; },
  recoverPin: async () => { native.unlocked = false; native.recovery = true; },
  replacePin: async ({ pin, confirm }: { pin: string; confirm: string }) => { if (!native.recovery || pin !== confirm) throw new Error('The PINs do not match.'); native.unlocked = true; native.replaced = true; },
  resetLockedApp: async ({ confirmation }: { confirmation: string }) => { if (confirmation !== 'DELETE KAIROS') throw new Error('Confirmation required.'); native.erased = true; },
  lock: async () => { native.unlocked = false; }, setTheme: async () => {},
  exportFile: async () => ({ saved: true }), erase: async () => { native.erased = true; },
} }));
beforeEach(async () => {
  native.configured = false; native.unlocked = false; native.erased = false; native.recovery = false; native.replaced = false;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const { driver } = memoryDriver(); await migrate(driver); native.repo = repository(driver);
});
afterEach(cleanup);
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionProvider><App/></SessionProvider></QueryClientProvider>); }

for (const theme of ['dark', 'light'] as const) it(`requires a replacement PIN after device recovery in ${theme}`, async () => {
  useTheme.getState().set(theme); native.configured = true; mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Forgot PIN?' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use device authentication' }));
  await screen.findByLabelText('New PIN');
  expect(document.documentElement.dataset.theme).toBe(theme);
  expect(native.unlocked).toBe(false); expect(screen.queryByRole('navigation')).toBeNull();
  await act(async () => { native.listener!({ isActive: true }); });
  expect(screen.queryByRole('navigation')).toBeNull();
  fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '135790' } });
  fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '135791' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new PIN' }));
  await screen.findByRole('alert'); expect(native.replaced).toBe(false);
  fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '135790' } });
  fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '135790' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new PIN' }));
  await screen.findByRole('navigation'); expect(native.replaced).toBe(true);
});
it('requires the exact destructive confirmation while locked', async () => {
  native.configured = true; mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Forgot PIN?' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset app' }));
  const reset = screen.getByRole('button', { name: 'Permanently reset app' });
  expect(reset.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Type DELETE KAIROS'), { target: { value: 'delete kairos' } });
  expect(reset.hasAttribute('disabled')).toBe(true); expect(native.erased).toBe(false);
  fireEvent.change(screen.getByLabelText('Type DELETE KAIROS'), { target: { value: 'DELETE KAIROS' } });
  fireEvent.click(reset); await waitFor(() => expect(native.erased).toBe(true));
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/ui/App';
import { SessionProvider } from '../src/ui/session';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
const native = vi.hoisted(() => ({ configured: false, unlocked: false, listener: undefined as ((state: { isActive: boolean }) => void) | undefined, repo: undefined as Repository | undefined, erased: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_name: string, callback: (state: { isActive: boolean }) => void) => { native.listener = callback; return { remove() {} }; } } }));
vi.mock('../src/core/db/native', () => ({ openDatabase: async () => native.repo, closeDatabase: async () => {}, deleteDatabase: async () => { native.erased = true; }, serial: async <T,>(fn: () => Promise<T>) => fn() }));
vi.mock('../src/core/crypto/native', () => ({ Vault: {
  status: async () => ({ configured: native.configured, unlocked: native.unlocked, biometric: false, biometricEnabled: false }),
  setup: async ({ pin, confirm }: { pin: string; confirm: string }) => { if (pin !== confirm) throw new Error('The PINs do not match.'); native.configured = true; native.unlocked = true; },
  unlock: async ({ pin }: { pin: string }) => { if (pin !== '246810') throw new Error('That PIN did not match.'); native.unlocked = true; },
  lock: async () => { native.unlocked = false; }, setTheme: async () => {},
  exportFile: async () => ({ saved: true }), erase: async () => { native.erased = true; },
} }));
beforeEach(async () => {
  native.configured = false; native.unlocked = false; native.erased = false;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const { driver } = memoryDriver(); await migrate(driver); native.repo = repository(driver);
});
afterEach(cleanup);
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionProvider><App/></SessionProvider></QueryClientProvider>); }
async function setup() { mount(); await screen.findByLabelText('Choose a PIN'); fireEvent.change(screen.getByLabelText('Choose a PIN'), { target: { value: '246810' } }); fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '246810' } }); fireEvent.click(screen.getByRole('button', { name: 'Create private ledger' })); await screen.findByRole('navigation', { name: 'Primary' }); }
  it('filters Quick actions and navigates without a dead import action', async () => {
    await setup(); fireEvent.click(screen.getByRole('button', { name: 'Ledger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick' }));
    expect(document.activeElement).not.toBe(screen.getByLabelText('Find an action'));
    expect(screen.getByRole('dialog', { name: 'Quick' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ledger' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Quick' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Quick' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ledger' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Quick' })); fireEvent.change(screen.getByLabelText('Find an action'), { target: { value: 'settings' } });
    expect(screen.queryByRole('button', { name: 'Import file' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Open settings' })); expect(screen.getByText('Appearance')).toBeTruthy();
  });

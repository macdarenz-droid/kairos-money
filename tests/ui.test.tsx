// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/ui/App';
import KitchenSink from '../src/ui/screens/KitchenSink';
import { SessionProvider } from '../src/ui/session';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
const native = vi.hoisted(() => ({ configured: false, unlocked: false, listener: undefined as ((state: { isActive: boolean }) => void) | undefined, repo: undefined as Repository | undefined, erased: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
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
describe('Foundation interactions using real SQLite and simulated native boundary', () => {
  it('sets up, adds an account, changes both themes, exports, and confirms deletion', async () => {
    await setup(); fireEvent.click(screen.getByRole('button', { name: 'Ledger' })); fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Everyday' } }); fireEvent.change(screen.getByLabelText('Opening balance'), { target: { value: '123.45' } }); fireEvent.click(screen.getByRole('button', { name: 'Save account' }));
    await screen.findByText('Everyday'); expect((await native.repo!.accounts())[0]?.opening_balance_minor).toBe(12345);
    fireEvent.click(screen.getByRole('button', { name: 'Insights' })); expect(screen.getByText('Still learning')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'You' })); fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    fireEvent.click(screen.getByRole('button', { name: 'Dark' })); await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    fireEvent.click(screen.getByRole('button', { name: 'Export all data' })); fireEvent.click(screen.getByRole('button', { name: 'Choose save location' })); await screen.findByText('Your JSON and CSV export was saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete all data' })); expect(native.erased).toBe(false); const actions=screen.getAllByRole('button', { name: 'Delete all data' }); expect(actions.at(-1)?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getAllByRole('button', { name: 'Delete all data' }).at(-1)!); await waitFor(() => expect(native.erased).toBe(true));
  });
  it('locks on demand, clears financial UI, rejects wrong PIN, and resumes the ledger', async () => {
    await setup(); fireEvent.click(screen.getByRole('button', { name: 'You' })); fireEvent.click(screen.getByRole('button', { name: 'Lock now' })); await screen.findByLabelText('PIN'); expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '000000' } }); fireEvent.click(screen.getByRole('button', { name: 'Unlock' })); await screen.findByText('That PIN did not match.');
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '246810' } }); fireEvent.click(screen.getByRole('button', { name: 'Unlock' })); await screen.findByRole('navigation');
  });
  it('filters Quick actions and navigates without a dead import action', async () => {
    await setup(); fireEvent.click(screen.getByRole('button', { name: 'Quick' })); fireEvent.change(screen.getByLabelText('Find an action'), { target: { value: 'settings' } });
    expect(screen.queryByRole('button', { name: 'Import file' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Open settings' })); expect(screen.getByText('Appearance')).toBeTruthy();
  });
  it('renders every kitchen sink primitive and opens its sheet in both themes', async () => {
    render(<KitchenSink/>);
    for (const theme of ['Light','Dark']) {
      fireEvent.click(screen.getByRole('button', { name: theme }));
      expect(document.documentElement.dataset.theme).toBe(theme.toLowerCase());
      expect(screen.getByLabelText('Synthetic example balance', { exact: false })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Open sheet' })); expect(screen.getByRole('dialog', { name: 'Example sheet' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Done' })); expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('status', { name: 'Example loading state' })).toBeTruthy();
    }
  });
});

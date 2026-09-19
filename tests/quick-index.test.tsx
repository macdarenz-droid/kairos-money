// @vitest-environment jsdom
// Quick is the only index of what this app can do. Backup, restore and transfers were all built, and all
// asked for a second time, because Quick did not name them — so what it names is worth pinning.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/ui/App';
import { SessionProvider } from '../src/ui/session';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
const native = vi.hoisted(() => ({ configured: false, unlocked: false, repo: undefined as Repository | undefined }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove() {} }) } }));
vi.mock('../src/core/db/native', () => ({ openDatabase: async () => native.repo, closeDatabase: async () => {}, deleteDatabase: async () => {}, serial: async <T,>(fn: () => Promise<T>) => fn() }));
vi.mock('../src/core/crypto/native', () => ({ Vault: {
  status: async () => ({ configured: native.configured, unlocked: native.unlocked, biometric: false, biometricEnabled: false }),
  setup: async ({ pin, confirm }: { pin: string; confirm: string }) => { if (pin !== confirm) throw new Error('The PINs do not match.'); native.configured = true; native.unlocked = true; },
  lock: async () => { native.unlocked = false; }, setTheme: async () => {},
  backupRecovery: async () => ({ code: 'synthetic code', acknowledged: false }),
} }));
beforeEach(async () => {
  native.configured = false; native.unlocked = false;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const { driver } = memoryDriver(); await migrate(driver); native.repo = repository(driver);
});
afterEach(cleanup);
async function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionProvider><App/></SessionProvider></QueryClientProvider>);
  await screen.findByLabelText('Choose a PIN');
  fireEvent.change(screen.getByLabelText('Choose a PIN'), { target: { value: '246810' } });
  fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '246810' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create private ledger' }));
  await screen.findByRole('navigation', { name: 'Primary' });
  fireEvent.click(screen.getByRole('button', { name: 'Quick' }));
  const field = await screen.findByLabelText('Find an action');
  // Scoped to the Quick sheet: the tab a previous test left behind may have its own button of the same
  // name on the screen underneath, and an ambiguous match would be a flake rather than a finding.
  return { field, quick: within(field.closest('dialog')!) };
}
describe('Quick names every feature the app has', () => {
  for (const term of ['backup', 'restore', 'transfer', 'currency', 'export'] as const) {
    it(`finds something for “${term}”`, async () => {
      const { field, quick } = await setup();
      fireEvent.change(field, { target: { value: term } });
      // One match is enough; nothing matching means the feature cannot be found at all.
      expect(quick.getAllByRole('button').filter(b => b.textContent?.toLowerCase().includes(term)).length).toBeGreaterThan(0);
    });
  }
  it('opens the backup sheet from Quick rather than leaving it on a settings screen', async () => {
    const { field, quick } = await setup();
    fireEvent.change(field, { target: { value: 'back up' } });
    fireEvent.click(quick.getByRole('button', { name: /Back up your ledger/ }));
    await screen.findByRole('dialog', { name: 'Encrypted backup' });
  });
  it('opens restore directly, not the chooser', async () => {
    const { field, quick } = await setup();
    fireEvent.change(field, { target: { value: 'restore' } });
    fireEvent.click(quick.getByRole('button', { name: /Restore a backup/ }));
    await screen.findByLabelText('Backup recovery code');
  });
  it('leaves no pending jump behind, so the sheet stays closed once dismissed', async () => {
    const { field, quick } = await setup();
    fireEvent.change(field, { target: { value: 'restore' } });
    fireEvent.click(quick.getByRole('button', { name: /Restore a backup/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Encrypted backup' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close Encrypted backup' }));
    await waitFor(() => expect(sheet.hasAttribute('open')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Ledger' }));
    fireEvent.click(screen.getByRole('button', { name: 'You' }));
    expect(screen.queryByLabelText('Backup recovery code')).toBeNull();
  });
});

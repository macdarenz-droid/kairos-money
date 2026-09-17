// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Backup } from '../src/ui/screens/Backup';
import { useTheme } from '../src/ui/design/theme';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
import { base64 } from '../src/core/db/export';
import { decryptBackup, encryptBackup } from '../src/core/crypto/backup';
const code = '2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789';
const native = vi.hoisted(() => ({ repo: undefined as Repository | undefined, saved: '', selected: '', acknowledged: false }));
vi.mock('../src/ui/session', () => ({ useSession: () => ({ run: async <T,>(fn: (repo: Repository) => Promise<T>) => fn(native.repo!) }) }));
vi.mock('../src/core/crypto/native', () => ({ Vault: {
  backupRecovery: async () => ({ code, acknowledged: false }),
  acknowledgeBackupCode: async () => { native.acknowledged = true; },
  exportFile: async ({ base64: value }: { base64: string }) => { native.saved = value; return { saved: true }; },
} }));
vi.mock('@capawesome/capacitor-file-picker', () => ({ FilePicker: { pickFiles: async () => ({ files: [{ path: 'synthetic.kairos', size: native.selected.length }] }) } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { readFile: async () => ({ data: native.selected }) } }));
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto); native.saved = ''; native.selected = ''; native.acknowledged = false;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const { driver } = memoryDriver(); await migrate(driver); native.repo = repository(driver);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() { render(<QueryClientProvider client={new QueryClient()}><Backup onClose={() => {}} notify={() => {}}/></QueryClientProvider>); }
for (const theme of ['dark', 'light'] as const) it(`requires written-code confirmation and saves encrypted data in ${theme}`, async () => {
  useTheme.getState().set(theme); mount(); fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }));
  await screen.findByLabelText('Recovery code'); const save = screen.getByRole('button', { name: 'Choose backup location' });
  expect(save.hasAttribute('disabled')).toBe(true); expect(native.saved).toBe(''); expect(native.acknowledged).toBe(false);
  fireEvent.click(screen.getByLabelText('I have written this down.')); fireEvent.click(save);
  await waitFor(() => expect(native.saved).not.toBe(''));
  expect(native.acknowledged).toBe(true); expect(document.documentElement.dataset.theme).toBe(theme);
  const snapshot = await decryptBackup(Uint8Array.from(atob(native.saved), char => char.charCodeAt(0)), code);
  expect(snapshot).toHaveProperty('format', 'kairos-money');
});
it('rejects a wrong code without writes and restores only after a valid code', async () => {
  await native.repo!.addAccount({ id: 'a', name: 'Synthetic saved account', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 123n });
  native.selected = base64(await encryptBackup(await native.repo!.exportAll(), code));
  const { driver } = memoryDriver(); await migrate(driver); native.repo = repository(driver);
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Restore a backup' }));
  fireEvent.change(screen.getByLabelText('Backup recovery code'), { target: { value: code.replace('2345', '2346') } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose backup file' })); await screen.findByRole('alert'); expect(await native.repo.accounts()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Backup recovery code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose backup file' }));
  await waitFor(async () => expect(await native.repo!.accounts()).toHaveLength(1));
});

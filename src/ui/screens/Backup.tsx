import {RecoveryCode} from '../design/RecoveryCode';
import { useState } from 'react';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem } from '@capacitor/filesystem';
import { useQueryClient } from '@tanstack/react-query';
import { Vault } from '../../core/crypto/native';
import { backupLimit, decryptBackup, encryptBackup } from '../../core/crypto/backup';
import { base64 } from '../../core/db/export';
import { Button, Input, Sheet } from '../design/primitives';
import { useSession } from '../session';
export function Backup({ onClose, notify, start = 'choose' }: { onClose: () => void; notify: (message: string) => void; start?: 'choose' | 'restore' }) {
  const session = useSession(); const query = useQueryClient();
  // Opened from Settings as "Restore a backup" it should BE the restore screen. Landing on a chooser and
  // pressing restore again is the same screen twice.
  const [mode, setMode] = useState<'choose' | 'save' | 'restore'>(start);
  const [code, setCode] = useState(''); const [written, setWritten] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  function failure(e: unknown) { setError(e instanceof Error ? e.message : 'The backup operation did not complete. Your ledger has not changed.'); }
  async function prepare() {
    setBusy(true); setError('');
    try { const recovery = await Vault.backupRecovery(); setCode(recovery.code); setWritten(recovery.acknowledged); setMode('save'); }
    catch (e) { failure(e); } finally { setBusy(false); }
  }
  async function save() {
    if (!written) return; setBusy(true); setError(''); let bytes: Uint8Array | undefined;
    try {
      await Vault.acknowledgeBackupCode({ code });
      bytes = await session.run(async repo => encryptBackup(await repo.exportAll(), code));
      const result = await Vault.exportFile({ base64: base64(bytes), fileName: 'Kairos-money-backup.kairos' });
      if (result.saved) { notify('Your encrypted backup was saved. Keep its recovery code separately.'); onClose(); }
      else setError('Save cancelled. No new backup was saved.');
    } catch (e) { failure(e); } finally { bytes?.fill(0); setBusy(false); }
  }
  async function restore() {
    setBusy(true); setError(''); let bytes: Uint8Array | undefined;
    try {
      const selection = await FilePicker.pickFiles({ readData: false, limit: 1 });
      const file = selection.files[0];
      if (!file) return;
      if (selection.files.length !== 1 || file.size > backupLimit || !file.path) throw new Error('Choose one locally saved Kairos backup, up to 64 MB.');
      const loaded = await Filesystem.readFile({ path: file.path });
      if (typeof loaded.data !== 'string' || loaded.data.length > Math.ceil(backupLimit / 3) * 4) throw new Error('The selected backup could not be read within the 64 MB limit.');
      bytes = Uint8Array.from(atob(loaded.data), char => char.charCodeAt(0));
      const snapshot = await decryptBackup(bytes, code);
      await session.run(repo => repo.restoreBackup(snapshot));
      await query.invalidateQueries();
      notify('Your ledger, import history and coverage were restored. New backups use this installation’s recovery code.'); onClose();
    } catch (e) { failure(e); } finally { bytes?.fill(0); setBusy(false); }
  }
  return <Sheet title="Encrypted backup" onClose={() => { if (!busy) onClose(); }}><div className="stack">
    {mode === 'choose' && <><p>A backup is encrypted with a recovery code. That code is not your PIN and cannot unlock this app.</p><Button disabled={busy} onClick={() => void prepare()}>Save a backup</Button><Button disabled={busy} onClick={() => { setCode(''); setMode('restore'); }}>Restore a backup</Button></>}
    {mode === 'save' && <><p>Write down all ten groups and keep them away from the backup file. Without this code the backup cannot be recovered.</p><RecoveryCode value={code}/><label className="check-row"><input type="checkbox" checked={written} onChange={event => setWritten(event.target.checked)}/>I have written this down.</label><p className="meta">Shown here again whenever Kairos is unlocked.</p><Button variant="primary" disabled={busy || !written} onClick={() => void save()} busy={busy} busyLabel="Preparing backup…">Choose backup location</Button></>}
    {mode === 'restore' && <><p>Restores into an empty ledger. Existing accounts and imports are kept, not replaced. Your PIN is unchanged.</p><Input label="Backup recovery code" autoComplete="off" spellCheck={false} value={code} onChange={event => setCode(event.target.value)}/><Button variant="primary" disabled={busy || !code.trim()} onClick={() => void restore()} busy={busy} busyLabel="Restoring…">Choose backup file</Button></>}
    {error && <p role="alert">{error}</p>}
  </div></Sheet>;
}

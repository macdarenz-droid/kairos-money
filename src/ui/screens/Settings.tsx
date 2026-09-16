import { Backup } from './Backup';
import { NotificationSettings } from './Notifications';
import { NoticeSettings } from './NoticeSettings';
import { useState } from 'react';
import { Download, Fingerprint, LockKeyhole, Trash2, ShieldCheck, Plus } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Vault } from '../../core/crypto/native';
import { deleteDatabase } from '../../core/db/native';
import { base64, exportArchive } from '../../core/db/export';
import { useTheme, type ThemePreference } from '../design/theme';
import { Button, Row, Sheet } from '../design/primitives';
import { Rates } from './Rates';
import { useSession } from '../session';
export function Settings({ onAccount, notify, accounts = [] }: { onAccount: () => void; notify: (text: string) => void; accounts?: readonly import('../../core/db/repository').Account[] }) {
  const session = useSession(); const { preference, set } = useTheme(); const [dialog, setDialog] = useState<'export' | 'delete' | 'privacy' | 'backup' | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [checked, setChecked] = useState(false);
  function close() { if (!busy) { setDialog(null); setChecked(false); setError(''); } }
  async function theme(value: ThemePreference) {
    setError('');
    try { if (Capacitor.isNativePlatform()) await Vault.setTheme({ theme: value }); set(value); }
    catch { setError('Appearance could not be saved. Free some device storage and try again.'); }
  }
  async function exportData() {
    setBusy(true); setError('');
    let bytes: Uint8Array | undefined;
    try {
      bytes = await session.run(exportArchive);
      const result = await Vault.exportFile({ base64: base64(bytes), fileName: 'Kairos-money-export.zip' });
      setDialog(null); notify(result.saved ? 'Your JSON and CSV export was saved.' : 'Export cancelled. No file was saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The export could not be saved. Choose another folder.'); }
    finally { bytes?.fill(0); setBusy(false); }
  }
  async function erase() {
    if (!checked) return; setBusy(true); setError('');
    try { await session.run(deleteDatabase); }
    catch (e) { setError(e instanceof Error ? e.message : 'Android could not delete your data. Try again.'); setBusy(false); }
  }
  return <>
    <section className="settings-section"><h2>Appearance</h2><div className="theme-choices">{(['system', 'dark', 'light'] as const).map(value => <Button key={value} aria-pressed={preference === value} onClick={() => void theme(value)}>{value === 'system' ? 'System' : value === 'dark' ? 'Dark' : 'Light'}</Button>)}</div></section>
    <section className="settings-section"><h2>Your ledger</h2><div className="action-list"><Button onClick={onAccount}><Plus size={18}/>Add an account</Button><Button disabled={session.state === 'preview'} onClick={() => setDialog('export')}><Download size={18}/>Export all data</Button><Button disabled={session.state === 'preview'} onClick={() => setDialog('backup')}>Encrypted backup</Button></div></section>
    <NotificationSettings/>
    <NoticeSettings accounts={accounts}/>
    <Rates accounts={accounts} notify={notify}/>
    <section className="settings-section"><h2>Privacy and security</h2><Row trailing={<ShieldCheck size={18}/>}>On-device storage<p>No financial data is sent to a server.</p></Row>
      {session.state === 'ready' && <><Row trailing={<Button aria-pressed={session.biometricEnabled} disabled={!session.biometric} onClick={() => { void Vault.setBiometric({ enabled: !session.biometricEnabled }).then(session.refreshBiometric).catch(() => setError('Biometrics could not be enabled. Check your Android security settings.')); }}>{session.biometricEnabled ? 'On' : 'Off'}</Button>}><Fingerprint size={16}/> Biometric unlock<p>{session.biometric ? 'Optional. Your PIN remains available.' : 'Set up biometrics in Android settings.'}</p></Row><div className="action-list"><Button onClick={() => void session.lock().catch(() => setError('Kairos locked. Restart the app to close storage safely.'))}><LockKeyhole size={18}/>Lock now</Button></div></>}
      <div className="action-list"><Button onClick={() => setDialog('privacy')}><ShieldCheck size={18}/>Privacy log</Button><Button variant="danger" disabled={session.state === 'preview'} onClick={() => setDialog('delete')}><Trash2 size={18}/>Delete all data</Button></div>
    </section><p className="meta">Kairos Money Tracker · 0.2.0</p>
    {error && !dialog && <p className="error section-gap" role="alert">{error}</p>}
    {dialog === 'backup' && <Backup onClose={close} notify={notify}/>}
    {dialog === 'privacy' && <Sheet title="Privacy log" onClose={close}><div className="stack"><ShieldCheck size={24}/><h3>No assisted parsing calls</h3><p>Assisted parsing is unavailable in this build. There is no analytics or crash-reporting service. Your ledger is stored on this device.</p><p>Exports are created only when you ask, in a location you choose.</p><Button onClick={close}>Done</Button></div></Sheet>}
    {dialog === 'export' && <Sheet title="Export your data" onClose={close}><div className="stack"><p>Save every ledger table as JSON and CSV in one ZIP. This export is readable without your PIN. Choose a private location in the Android file picker.</p>{error && <p role="alert" className="error">{error}</p>}<div className="form-actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} variant="primary" onClick={() => void exportData()}>{busy ? 'Preparing…' : 'Choose save location'}</Button></div></div></Sheet>}
    {dialog === 'delete' && <Sheet title="Delete all data?" onClose={close}><div className="stack"><p>This removes your ledger, accounts, files, settings and PIN from this device. Kairos will close. This cannot be undone.</p><p>Copies you previously exported outside Kairos must be deleted separately.</p><label className="check-row"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>I understand that my data will be removed.</label>{error && <p role="alert" className="error">{error}</p>}<div className="form-actions"><Button disabled={busy} onClick={close}>Keep my data</Button><Button variant="danger" disabled={!checked || busy} onClick={() => void erase()}>{busy ? 'Deleting…' : 'Delete all data'}</Button></div></div></Sheet>}
  </>;
}

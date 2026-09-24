import { Backup } from './Backup';
import { NotificationSettings } from './Notifications';
import { NoticeSettings } from './NoticeSettings';
import { AdvisorLog } from '../advisor/AdvisorLog';
import { AdvisorSettings, useAdvisor } from '../advisor/AdvisorSettings';
import { useEffect, useState } from 'react';
import { Download, Fingerprint, LockKeyhole, Trash2, ShieldCheck, Plus, ArchiveRestore, ShieldPlus } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Vault } from '../../core/crypto/native';
import { deleteDatabase } from '../../core/db/native';
import { base64, exportArchive } from '../../core/db/export';
import { useTheme, type ThemePreference } from '../design/theme';
import { ThemeChoices } from '../design/ThemeChoices';
import { Button, Row, Sheet } from '../design/primitives';
import { useSession } from '../session';
/** What Quick can jump straight to. He asked for backup and restore twice while both were already here. */
export type SettingsFocus = 'backup' | 'restore' | 'export' | 'currency';
export function Settings({ onAccount, notify, accounts = [], focus = null, onFocused }: { onAccount: () => void; notify: (text: string) => void; accounts?: readonly import('../../core/db/repository').Account[]; focus?: SettingsFocus | null; onFocused?: () => void }) {
  const session = useSession(); const { preference, set } = useTheme(); const [dialog, setDialog] = useState<'export' | 'delete' | 'privacy' | 'backup' | 'restore' | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [checked, setChecked] = useState(false);
  const advisorOn = useAdvisor().data?.settings.enabled === true;
  function close() { if (!busy) { setDialog(null); setChecked(false); setError(''); } }
  // A jump arrives as a request, and is consumed whether or not it could be honoured — a focus left set
  // would reopen the sheet every time this screen re-rendered.
  useEffect(() => {
    if (!focus) return;
    if (focus === 'currency') document.getElementById('settings-currency')?.scrollIntoView({ block: 'start' });
    else if (session.state === 'ready') setDialog(focus);
    onFocused?.();
  }, [focus, session.state, onFocused]);
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
    <section className="settings-section"><h2>Appearance</h2><ThemeChoices preference={preference} choose={value => void theme(value)}/></section>
    <section className="settings-section"><h2>Your ledger</h2><div className="action-list"><Button onClick={onAccount}><Plus size={18}/>Add an account</Button><Button disabled={session.state === 'preview'} onClick={() => setDialog('backup')}><ShieldPlus size={18}/>Back up</Button><Button disabled={session.state === 'preview'} onClick={() => setDialog('restore')}><ArchiveRestore size={18}/>Restore a backup</Button><Button disabled={session.state === 'preview'} onClick={() => setDialog('export')}><Download size={18}/>Export all data</Button></div></section>
    <NotificationSettings/>
    <NoticeSettings accounts={accounts}/>
    <AdvisorSettings/>
    <section className="settings-section"><h2>Privacy and security</h2><Row trailing={<ShieldCheck size={18}/>}>On-device storage<p>{advisorOn ? 'Only what you send to Claude leaves this device.' : 'No amount, merchant or account leaves this device.'}</p></Row>
      {session.state === 'ready' && <><Row trailing={<Button aria-pressed={session.biometricEnabled} disabled={!session.biometric} onClick={() => { void Vault.setBiometric({ enabled: !session.biometricEnabled }).then(session.refreshBiometric).catch(() => setError('Biometrics could not be enabled. Check your Android security settings.')); }}>{session.biometricEnabled ? 'On' : 'Off'}</Button>}><Fingerprint size={16}/> Biometric unlock<p>{session.biometric ? 'Optional. Your PIN remains available.' : 'Set up biometrics in Android settings.'}</p></Row><div className="action-list"><Button onClick={() => void session.lock().catch(() => setError('Kairos locked. Restart the app to close storage safely.'))}><LockKeyhole size={18}/>Lock now</Button></div></>}
      <div className="action-list"><Button onClick={() => setDialog('privacy')}><ShieldCheck size={18}/>Privacy log</Button><Button variant="danger" disabled={session.state === 'preview'} onClick={() => setDialog('delete')}><Trash2 size={18}/>Delete all data</Button></div>
    </section><p className="meta">Kairos Money Tracker · {__KAIROS_VERSION__} · {__KAIROS_BUILD__}</p>
    {error && !dialog && <p className="error section-gap" role="alert">{error}</p>}
    {(dialog === 'backup' || dialog === 'restore') && <Backup start={dialog === 'restore' ? 'restore' : 'choose'} onClose={close} notify={notify}/>}
    {dialog === 'privacy' && <Sheet title="Privacy log" onClose={close}><div className="stack"><ShieldCheck size={24}/><AdvisorLog/><p>No analytics, no crash reporting. Your ledger is stored on this device. Exchange rates are fetched with a currency code and a date; Claude gets only what you send.</p><p>Exports happen when you ask, where you choose.</p><Button onClick={close}>Done</Button></div></Sheet>}
    {dialog === 'export' && <Sheet title="Export your data" onClose={close}><div className="stack"><p>Every ledger table as JSON and CSV in one ZIP. Readable without your PIN, so choose a private location.</p>{error && <p role="alert" className="error">{error}</p>}<div className="form-actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} variant="primary" onClick={() => void exportData()}>{busy ? 'Preparing…' : 'Choose save location'}</Button></div></div></Sheet>}
    {dialog === 'delete' && <Sheet title="Delete all data?" onClose={close}><div className="stack"><p>This removes your ledger, accounts, files, settings and PIN from this device. Kairos will close. This cannot be undone.</p><p>Copies you previously exported outside Kairos must be deleted separately.</p><label className="check-row"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>I understand that my data will be removed.</label>{error && <p role="alert" className="error">{error}</p>}<div className="form-actions"><Button disabled={busy} onClick={close}>Keep my data</Button><Button variant="danger" disabled={!checked || busy} onClick={() => void erase()}>{busy ? 'Deleting…' : 'Delete all data'}</Button></div></div></Sheet>}
  </>;
}

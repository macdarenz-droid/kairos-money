import {RecoveryCode} from '../design/RecoveryCode';
import { useEffect, useState, type FormEvent } from 'react';
import { Fingerprint, LockKeyhole } from 'lucide-react';
import { Vault } from '../../core/crypto/native';
import { Button, DeleteConfirm, Input, Sheet } from '../design/primitives';
// No PIN guards the lock screen, so a wipe there needs this typed phrase too; the plugin checks it again.
const RESET_CONFIRMATION = 'DELETE KAIROS';
import { Loader } from '../design/Motion';
import { useSession } from '../session';
export function Brand() { return <div className="brand"><span className="brand-mark" aria-hidden="true"><img src="/branding/kairos-logo.svg" width="26" height="26" alt=""/></span><span>Kairos</span></div>; }
export function LockScreen() {
  const session = useSession(); const setup = session.state === 'setup';
  const [pin, setPin] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<'options' | 'replace' | 'reset' | null>(null);
  const [understood, setUnderstood] = useState(false); const [typed, setTyped] = useState(''); const [written, setWritten] = useState(false);
  useEffect(() => { setWritten(false); }, [session.recoveryCode]);
  async function acknowledge() { setBusy(true); setError(''); try { await session.acknowledgeRecovery(); } catch (e) { setError(e instanceof Error ? e.message : 'Confirmation could not be saved. Try again.'); } finally { setBusy(false); } }
  async function recover() { setBusy(true); setError(''); try { await session.recoverPin(); setRecovery('replace'); } catch (e) { setError(e instanceof Error ? e.message : 'Device authentication did not complete.'); } finally { setBusy(false); } }
  async function reset() { setBusy(true); setError(''); try { if (!understood || typed !== RESET_CONFIRMATION) return; await Vault.resetLockedApp({ confirmation: typed }); } catch (e) { setError(e instanceof Error ? e.message : 'Android could not reset Kairos.'); } finally { setBusy(false); } }
  async function submit(event?: FormEvent, biometrics = false) {
    event?.preventDefault(); setBusy(true); setError('');
    const entered = pin; const repeated = confirm; setPin(''); setConfirm('');
    try { if (recovery === 'replace') { await session.replacePin(entered, repeated); setRecovery(null); } else if (biometrics) await session.biometricUnlock(); else await session.unlock(entered, setup ? repeated : undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unlock did not complete. Try your PIN again.'); }
    finally { setBusy(false); }
  }
  return <main className="lock-screen"><Brand/>{session.state === 'checking' || session.state === 'background' ? <Loader label="Opening secure storage"/> : session.state === 'recovery-code' ? <><h1>Keep your recovery code</h1><div className="stack"><p>This code restores an encrypted backup on a new phone or after a reset. It does not unlock this installation. Keep it separately from your backups.</p><RecoveryCode value={session.recoveryCode}/><label className="check-row"><input type="checkbox" checked={written} onChange={event => setWritten(event.target.checked)}/>I have written this down.</label><Button variant="primary" disabled={!written || busy} onClick={() => void acknowledge()}>Continue to ledger</Button>{error && <p role="alert">{error}</p>}</div></> : session.state === 'error' ? <><h1>Storage needs attention</h1><p>{session.error}</p><div className="section-gap"><Button onClick={() => void session.retry()}>Try again</Button></div></> : <>
    <h1>{recovery === 'replace' ? 'Choose a new PIN' : setup ? 'Your money.\nYour device.' : 'Welcome back'}</h1><p>{recovery === 'replace' ? 'Your device is verified. Save a new Kairos PIN before opening your ledger.' : setup ? 'Your financial data stays on this device. Set a PIN to protect your ledger.' : 'Unlock your private ledger to continue.'}</p>
    <form className="stack" onSubmit={event => void submit(event)}><Input label={recovery === 'replace' ? 'New PIN' : setup ? 'Choose a PIN' : 'PIN'} type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" required value={pin} onChange={event => setPin(event.target.value)} hint={setup ? 'Use 6–12 digits. Device authentication can recover a forgotten PIN.' : undefined}/>
      {(setup || recovery === 'replace') && <Input label="Confirm PIN" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" required value={confirm} onChange={event => setConfirm(event.target.value)}/>}
      {error && <p className="error" role="alert">{error}</p>}<Button variant="primary" type="submit" busy={busy} busyLabel="Opening…">{recovery === 'replace' ? 'Save new PIN' : setup ? 'Create private ledger' : 'Unlock'}</Button>
      {!setup && recovery !== 'replace' && session.biometric && session.biometricEnabled && <Button disabled={busy} onClick={() => void submit(undefined, true)}><Fingerprint size={18}/>Use biometrics</Button>}
      {recovery === 'replace' && <Button disabled={busy} onClick={() => void recover()}>Verify device again</Button>}
    </form>{!setup && recovery !== 'replace' && <Button variant="quiet" disabled={busy} onClick={() => { setError(''); setRecovery('options'); }}>Forgot PIN?</Button>}</>}
    {(recovery === 'options' || recovery === 'reset') && <Sheet title={recovery === 'reset' ? 'Reset Kairos' : 'Forgot PIN?'} onClose={() => { if (!busy) { setRecovery(null); setUnderstood(false); setTyped(''); setError(''); } }}>
      <div className="stack">{recovery === 'options' ? <><p>Use your Android screen lock or biometrics to choose a new Kairos PIN. If you cannot authenticate, resetting permanently deletes this installation.</p><Button disabled={busy} onClick={() => void recover()}>Use device authentication</Button><Button disabled={busy} onClick={() => { setError(''); setRecovery('reset'); }}>Reset app</Button></> : <><DeleteConfirm checked={understood} onChange={setUnderstood} phrase={RESET_CONFIRMATION} typed={typed} onTyped={setTyped}/><Button variant="danger" disabled={busy || !understood || typed !== RESET_CONFIRMATION} onClick={() => void reset()}>Permanently reset app</Button></>}{error && <p role="alert">{error}</p>}</div>
    </Sheet>}
    <div className="lock-footer information"><LockKeyhole size={15}/><p>No account. No analytics. Encrypted storage on your device.</p></div>
  </main>;
}

import { useState, type FormEvent } from 'react';
import { Fingerprint, LockKeyhole } from 'lucide-react';
import { Button, Input, Skeleton } from '../design/primitives';
import { useSession } from '../session';
export function Brand() { return <div className="brand"><span className="brand-mark" aria-hidden="true"><img src="/branding/kairos-aperture.png" width="26" height="26" alt=""/></span><span>Kairos</span></div>; }
export function LockScreen() {
  const session = useSession(); const setup = session.state === 'setup';
  const [pin, setPin] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event?: FormEvent, biometrics = false) {
    event?.preventDefault(); setBusy(true); setError('');
    const entered = pin; const repeated = confirm; setPin(''); setConfirm('');
    try { if (biometrics) await session.biometricUnlock(); else await session.unlock(entered, setup ? repeated : undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unlock did not complete. Try your PIN again.'); }
    finally { setBusy(false); }
  }
  return <main className="lock-screen"><Brand/>{session.state === 'checking' || session.state === 'background' ? <Skeleton label="Opening secure storage"/> : session.state === 'error' ? <><h1>Storage needs attention</h1><p>{session.error}</p><div className="section-gap"><Button onClick={() => void session.retry()}>Try again</Button></div></> : <>
    <h1>{setup ? 'Your money.\nYour device.' : 'Welcome back'}</h1><p>{setup ? 'Your financial data stays on this device. Set a PIN to protect your ledger.' : 'Unlock your private ledger to continue.'}</p>
    <form className="stack" onSubmit={event => void submit(event)}><Input label={setup ? 'Choose a PIN' : 'PIN'} type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" required value={pin} onChange={event => setPin(event.target.value)} hint={setup ? 'Use 6–12 digits. Keep your PIN safe; there is no account-based recovery.' : undefined}/>
      {setup && <Input label="Confirm PIN" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" required value={confirm} onChange={event => setConfirm(event.target.value)}/>}
      {error && <p className="error" role="alert">{error}</p>}<Button variant="primary" type="submit" disabled={busy}>{busy ? 'Opening…' : setup ? 'Create private ledger' : 'Unlock'}</Button>
      {!setup && session.biometric && session.biometricEnabled && <Button disabled={busy} onClick={() => void submit(undefined, true)}><Fingerprint size={18}/>Use biometrics</Button>}
    </form></>}
    <div className="lock-footer information"><LockKeyhole size={15}/><p>No account. No analytics. Encrypted storage on your device.</p></div>
  </main>;
}

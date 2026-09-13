import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { useQueryClient } from '@tanstack/react-query';
import { Vault } from '../core/crypto/native';
import { closeDatabase, openDatabase, serial } from '../core/db/native';
import { requiresUnlock } from '../core/crypto/lifecycle';
import type { Repository } from '../core/db/repository';
type State = 'checking' | 'setup' | 'locked' | 'ready' | 'preview' | 'error' | 'background';
type Session = { state: State; error: string; biometric: boolean; biometricEnabled: boolean; run: <T>(fn: (repo: Repository) => Promise<T>) => Promise<T>; unlock: (pin: string, confirm?: string) => Promise<void>; biometricUnlock: () => Promise<void>; lock: () => Promise<void>; retry: () => Promise<void>; refreshBiometric: () => Promise<void> };
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>('checking'); const [error, setError] = useState('');
  const [biometric, setBiometric] = useState(false); const [biometricEnabled, setBiometricEnabled] = useState(false);
  const repo = useRef<Repository>(); const backgroundAt = useRef<number | null>(null); const epoch = useRef(0);
  const query = useQueryClient();
  const refreshBiometric = useCallback(async () => { const status = await Vault.status(); setBiometric(status.biometric); setBiometricEnabled(status.biometricEnabled); }, []);
  const retry = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) { setState('preview'); return; }
    setState('checking'); setError('');
    try { const status = await Vault.status(); setBiometric(status.biometric); setBiometricEnabled(status.biometricEnabled); setState(status.configured ? 'locked' : 'setup'); }
    catch { setError('Secure storage could not be opened. Restart Kairos, check available device storage, then try again.'); setState('error'); }
  }, []);
  const open = useCallback(async () => {
    const generation = epoch.current;
    await serial(async () => {
      await closeDatabase(); const opened = await openDatabase();
      if (generation !== epoch.current) { await closeDatabase(); return; }
      repo.current = opened; setError(''); setState('ready');
    });
  }, []);
  const lock = useCallback(async () => {
    epoch.current++; repo.current = undefined; query.clear(); setState('locked');
    await Vault.lock(); await serial(closeDatabase);
  }, [query]);
  useEffect(() => { void retry(); }, [retry]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        backgroundAt.current = Date.now(); epoch.current++; repo.current = undefined; query.clear();
        document.documentElement.classList.add('session-obscured'); setState('background');
        void serial(closeDatabase).catch(() => { setState('error'); setError('Storage could not close safely. Restart Kairos.'); });
      } else {
        void (async () => {
          try {
            const status = await Vault.status();
            if (!status.configured) { setState('setup'); return; }
            if (requiresUnlock(backgroundAt.current, Date.now(), status.unlocked)) await lock(); else await open();
          } catch { setState('error'); setError('Kairos could not resume safely. Restart it before opening your ledger.'); }
          finally { document.documentElement.classList.remove('session-obscured'); }
        })();
      }
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [lock, open, query]);
  async function run<T>(fn: (repo: Repository) => Promise<T>): Promise<T> {
    return serial(async () => {
      const current = repo.current;
      if (!current || !(await Vault.status()).unlocked) throw new Error('Unlock the Android app to access your ledger.');
      return fn(current);
    });
  }
  return <Context.Provider value={{ state, error, biometric, biometricEnabled, run, lock, retry, refreshBiometric,
    async unlock(pin, confirm) { if (confirm !== undefined) await Vault.setup({ pin, confirm }); else await Vault.unlock({ pin }); await open(); },
    async biometricUnlock() { await Vault.authenticate(); await open(); },
  }}>{children}</Context.Provider>;
}
export function useSession(): Session { const value = useContext(Context); if (!value) throw new Error('Session provider is missing.'); return value; }

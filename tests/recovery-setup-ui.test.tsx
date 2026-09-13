// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/ui/App';
import { useTheme } from '../src/ui/design/theme';
import { SessionProvider } from '../src/ui/session';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
const native = vi.hoisted(() => ({ configured: false, unlocked: false, pause: undefined as (()=>void)|undefined, listener: undefined as ((state: { isActive: boolean }) => void) | undefined, repo: undefined as Repository | undefined, erased: false, recovery: false, replaced: false, acknowledged: false, opens: 0, opening: undefined as Promise<void> | undefined }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_name: string, callback: (state: { isActive: boolean }) => void) => { if(_name==='pause')native.pause=()=>callback({isActive:false});else native.listener = callback; return { remove() {} }; } } }));
vi.mock('../src/core/db/native', () => ({ openDatabase: async () => { native.opens++; await native.opening; return native.repo; }, closeDatabase: async () => {}, deleteDatabase: async () => { native.erased = true; }, serial: async <T,>(fn: () => Promise<T>) => fn() }));
vi.mock('../src/core/crypto/native', () => ({ Vault: {
  status: async () => ({ configured: native.configured, unlocked: native.unlocked, biometric: false, biometricEnabled: false, backupCodeRequired: native.unlocked && !native.acknowledged }),
  backupRecovery: async () => ({code:'2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789', acknowledged:native.acknowledged}),
  acknowledgeBackupCode: async () => { native.acknowledged=true; },
  setup: async ({ pin, confirm }: { pin: string; confirm: string }) => { if (pin !== confirm) throw new Error('The PINs do not match.'); native.configured = true; native.unlocked = true; },
  unlock: async ({ pin }: { pin: string }) => { if (pin !== '246810') throw new Error('That PIN did not match.'); native.unlocked = true; },
  recoverPin: async () => { native.unlocked = false; native.recovery = true; },
  replacePin: async ({ pin, confirm }: { pin: string; confirm: string }) => { if (!native.recovery || pin !== confirm) throw new Error('The PINs do not match.'); native.unlocked = true; native.replaced = true; },
  resetLockedApp: async ({ confirmation }: { confirmation: string }) => { if (confirmation !== 'DELETE KAIROS') throw new Error('Confirmation required.'); native.erased = true; },
  lock: async () => { native.unlocked = false; }, setTheme: async () => {},
  exportFile: async () => ({ saved: true }), erase: async () => { native.erased = true; },
} }));
beforeEach(async () => {
  native.opening=undefined; native.acknowledged=false; native.opens=0; native.configured = false; native.unlocked = false; native.erased = false; native.recovery = false; native.replaced = false;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const { driver } = memoryDriver(); await migrate(driver); native.repo = repository(driver);
});
afterEach(cleanup);
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionProvider><App/></SessionProvider></QueryClientProvider>); }

for (const theme of ['dark', 'light'] as const) it(`requires written-code confirmation before opening the ledger in ${theme}`, async () => {
  useTheme.getState().set(theme); mount();
  fireEvent.change(await screen.findByLabelText('Choose a PIN'), {target:{value:'246810'}});
  fireEvent.change(screen.getByLabelText('Confirm PIN'), {target:{value:'246810'}});
  fireEvent.click(screen.getByRole('button',{name:'Create private ledger'}));
  await screen.findByText('Keep your recovery code');
  expect(native.opens).toBe(0);expect(screen.queryByRole('navigation')).toBeNull();
  expect((screen.getByRole('button',{name:'Continue to ledger'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  await act(async()=>{native.pause!();});
  await act(async()=>{native.listener!({isActive:true});});
  await screen.findByText('Keep your recovery code');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);expect(native.opens).toBe(0);
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Continue to ledger'}));
  await screen.findByRole('navigation');expect(native.acknowledged).toBe(true);expect(native.opens).toBe(1);
});

it('does not launch a second database open while Android authentication is showing', async()=>{
 native.configured=true;native.acknowledged=true;
 let complete!:()=>void;native.opening=new Promise<void>(resolve=>{complete=resolve;});mount();
 fireEvent.change(await screen.findByLabelText('PIN'),{target:{value:'246810'}});fireEvent.click(screen.getByRole('button',{name:'Unlock'}));
 await waitFor(()=>expect(native.opens).toBe(1));
 await act(async()=>{native.pause!();native.listener!({isActive:true});});
 expect(native.opens).toBe(1);expect(screen.queryByRole('navigation')).toBeNull();
 await act(async()=>complete());await screen.findByRole('navigation');
});
it('returns to the locked screen if native key authentication fails',async()=>{
 native.configured=true;native.acknowledged=true;
 let reject!: (error:Error)=>void;native.opening=new Promise<void>((_,fail)=>{reject=fail;});mount();
 fireEvent.change(await screen.findByLabelText('PIN'),{target:{value:'246810'}});fireEvent.click(screen.getByRole('button',{name:'Unlock'}));
 await waitFor(()=>expect(native.opens).toBe(1));
 await act(async()=>{native.pause!();reject(new Error('Device authentication cancelled'));});
 await screen.findByRole('alert');expect(native.unlocked).toBe(false);expect(screen.queryByRole('navigation')).toBeNull();
});

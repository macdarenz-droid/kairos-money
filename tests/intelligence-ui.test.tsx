// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/ui/App';
import { SessionProvider } from '../src/ui/session';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
const native = vi.hoisted(() => ({ configured: false, unlocked: false, pause: undefined as (()=>void)|undefined, listener: undefined as ((state: { isActive: boolean }) => void) | undefined, repo: undefined as Repository | undefined, erased: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_name: string, callback: (state: { isActive: boolean }) => void) => { if(_name==='pause')native.pause=()=>callback({isActive:false});else native.listener = callback; return { remove() {} }; } } }));
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
it('keeps the import action out of the loading state until accounts can support it',async()=>{await native.repo!.addAccount({id:'a',name:'Synthetic',institution:'Test',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});const accounts=native.repo!.accounts;vi.spyOn(native.repo!,'accounts').mockImplementation(async()=>{await pending;return accounts();});await setup();fireEvent.click(screen.getByRole('button',{name:'Ledger'}));expect(screen.getByRole('status',{name:'Reading accounts'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Import statements'})).toBeNull();release();await waitFor(()=>expect(screen.getByRole('button',{name:'Import statements'}).hasAttribute('disabled')).toBe(false));});

it('does not lock an authenticated foreground session on a repeated active notification',async()=>{await setup();await act(async()=>{native.listener!({isActive:true});});expect(native.unlocked).toBe(true);expect(screen.getByRole('navigation',{name:'Primary'})).toBeTruthy();});
it('tracks a pause without stop and preserves a short authenticated picker return',async()=>{await setup();let now=100000;const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);try{await act(async()=>{native.pause!();});expect(screen.queryByRole('navigation')).toBeNull();now+=1000;await act(async()=>{native.listener!({isActive:true});});await screen.findByRole('navigation');expect(native.unlocked).toBe(true);}finally{clock.mockRestore();}});
it('does not extend the 60-second deadline when stop follows pause',async()=>{await setup();let now=100000;const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);try{await act(async()=>{native.pause!();});now+=59000;await act(async()=>{native.listener!({isActive:false});});now+=1000;await act(async()=>{native.listener!({isActive:true});});await screen.findByLabelText('PIN');expect(native.unlocked).toBe(false);expect(screen.queryByRole('navigation')).toBeNull();}finally{clock.mockRestore();}});

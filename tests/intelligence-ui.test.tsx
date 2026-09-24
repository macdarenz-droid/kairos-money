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
it('starts an empty Today with one card and one primary, then orders the sections once data exists', async () => {
  await setup(); fireEvent.click(screen.getByRole('button', {name: 'Today'}));
  const start = await screen.findByRole('region', {name: 'Get started'}, {timeout: 5000});
  expect(start.querySelector('.coin-stack')).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Add your first statement'}).className).toContain('button-primary');
  expect(screen.getByRole('button', {name: 'Add transaction'}).className).toContain('button-default');
  cleanup();
  await native.repo!.addAccount({id:'a',name:'Synthetic',institution:'Test',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  await native.repo!.manual.save({id:'m',kind:'expense',accountId:'a',destinationId:null,date:new Date().toISOString().slice(0,10),minor:'1000',description:'Synthetic purchase',category:null,notes:''});
  native.configured = true; mount(); await screen.findByLabelText('PIN');
  fireEvent.change(screen.getByLabelText('PIN'), {target: {value: '246810'}}); fireEvent.click(screen.getByRole('button', {name: 'Unlock'}));
  fireEvent.click(await screen.findByRole('button', {name: 'Today'}));
  const add = await screen.findByRole('button', {name: 'Add transaction'}, {timeout: 5000});
  await waitFor(() => expect(add.className).toContain('button-primary'), {timeout: 5000});
  expect(screen.queryByRole('region', {name: 'Get started'})).toBeNull();
  const today = document.querySelector('.today')!;
  const band = await screen.findByRole('region', {name: 'Your money'}, {timeout: 5000});
  const recorded = await screen.findByRole('heading', {name: 'Recorded today'});
  const order = [band, add, recorded].map(node => [...today.querySelectorAll('*')].indexOf(node));
  expect(order).toEqual([...order].sort((x, y) => x - y));
  expect(order.every(index => index >= 0)).toBe(true);
});
it('orders the Ledger: import first, then accounts, then history', async () => {
  await native.repo!.addAccount({id:'a',name:'Synthetic',institution:'Test',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  await setup(); fireEvent.click(screen.getByRole('button', {name: 'Ledger'}));
  const importButton = await screen.findByRole('button', {name: 'Import statements'}, {timeout: 5000});
  const accounts = await screen.findByRole('heading', {name: 'Accounts'});
  const history = await screen.findByRole('heading', {name: 'History'});
  const all = [...document.querySelectorAll('main *')];
  expect([importButton, accounts, history].map(node => all.indexOf(node))).toEqual([importButton, accounts, history].map(node => all.indexOf(node)).sort((x, y) => x - y));
  expect(importButton.className).toContain('button-primary');
  expect(importButton.className).toContain('add-primary');
  expect(importButton.closest('.form-actions')).toBeNull();
});
it('shows one empty state and one primary on an empty Ledger', async () => {
  await setup(); fireEvent.click(screen.getByRole('button', {name: 'Ledger'}));
  await screen.findByRole('heading', {name: 'Add an account to import your statement'}, {timeout: 5000});
  await screen.findByRole('heading', {name: 'History'});
  expect(screen.queryByRole('button', {name: 'Import statements'})).toBeNull();
  expect(screen.queryByText('No transactions yet')).toBeNull();
  expect(document.querySelectorAll('main .empty-state')).toHaveLength(1);
  expect([...document.querySelectorAll('main .button-primary')].map(b => b.textContent)).toEqual(['Set up an account']);
});
it('orders You: currency, appearance, Kairos AI, notifications, privacy, data, then delete last', async () => {
  await setup(); fireEvent.click(screen.getByRole('button', {name: 'You'}));
  await screen.findByRole('heading', {name: 'Your data'}, {timeout: 5000});
  const all = [...document.querySelectorAll('main *')];
  const at = (node: Element | null) => all.indexOf(node!);
  const heading = (name: string | RegExp) => screen.getByRole('heading', {name});
  const order = [document.querySelector('#settings-currency'), heading('Appearance'), heading(/Kairos AI/), heading('Notifications'),
    heading("Read my bank's notifications"), heading('Privacy and security'), heading('Your data'), screen.getByRole('button', {name: 'Delete all data'})].map(at);
  expect(order.every(index => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((x, y) => x - y));
  expect(screen.getByRole('button', {name: 'Delete all data'}).closest('.danger-zone')).toBeTruthy();
});

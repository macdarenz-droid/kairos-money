// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
import { hash } from '../src/ingest/normalize';
import { ImportWorkspace } from '../src/ui/screens/ImportWorkspace';
import { Freshness, UpdateAccounts } from '../src/ui/screens/UpdateAccounts';
import type { Batch } from '../src/ingest/types';
const state = vi.hoisted(()=>({repo:undefined as Repository|undefined}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>false},registerPlugin:()=>({})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);await state.repo.addAccount({id:'a',name:'Synthetic account',institution:'Westpac',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
afterEach(cleanup);
it.each(['dark','light'])('maps an ambiguous export, commits Tier C, and reports the result in %s',async theme=>{
 document.documentElement.dataset.theme=theme;
 const csv='Date,Description,Amount\n03/04/2026,Synthetic cafe,-12.00';await state.repo!.imports.stageFile('ambiguous.csv',btoa(csv),hash(csv));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={()=>undefined}/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Read file'}));
 fireEvent.change(screen.getByLabelText('Statement start'),{target:{value:'2026-01-01'}});fireEvent.change(screen.getByLabelText('Statement end'),{target:{value:'2026-12-31'}});
 fireEvent.click(screen.getByRole('button',{name:'Extract for review'}));await screen.findByText('Map export columns');expect(await state.repo!.imports.ledger()).toHaveLength(0);
 expect(screen.getByRole('table')).toBeTruthy();fireEvent.change(screen.getByLabelText('Export date format'),{target:{value:'DMY'}});fireEvent.click(screen.getByRole('button',{name:'Use mapping and read'}));
 await screen.findByText(/Tier C · Continuity-checked · balance unverified/);fireEvent.click(screen.getByRole('button',{name:'Confirm import'}));await screen.findByText(/Added 1 new transaction/);expect((await state.repo!.imports.ledger())[0]?.date).toBe('2026-04-03');expect(await state.repo!.imports.savedMapping('Westpac')).toBeDefined();
});
it.each(['dark','light'])('renders muted nine-day freshness and overlapping dates in one %s sheet',async theme=>{
 document.documentElement.dataset.theme=theme;const accounts=await state.repo!.accounts();
 const batches=[{status:'committed',payslip:null,context:{accountId:'a',period:{start:'2026-03-01',end:'2026-03-22'}}}] as Batch[];
 const open=vi.fn();const view=render(<Freshness accounts={accounts} batches={batches} today="2026-03-31" onUpdate={open}/>);
 expect(view.container.querySelector('.surface-muted')).toBeTruthy();expect(screen.getByText(/9 days ago/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Bring my statements up to date'}));expect(open).toHaveBeenCalledOnce();cleanup();
 render(<QueryClientProvider client={new QueryClient()}><UpdateAccounts accounts={accounts} batches={batches} today="2026-03-31" onClose={()=>undefined} onImport={()=>undefined}/></QueryClientProvider>);
 expect(screen.getAllByRole('dialog')).toHaveLength(1);expect(screen.getByText('Export 16 March 2026 to 31 March 2026')).toBeTruthy();
});

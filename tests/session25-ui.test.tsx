// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
import { hash } from '../src/ingest/normalize';
import { ImportWorkspace } from '../src/ui/screens/ImportWorkspace';
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

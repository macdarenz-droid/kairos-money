// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
import { hash } from '../src/ingest/normalize';
import { ImportWorkspace } from '../src/ui/screens/ImportWorkspace';
const state = vi.hoisted(() => ({ repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown> }));
vi.mock('../src/ui/session', () => ({ useSession: () => ({ state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; } }) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
beforeEach(async () => { const { driver } = memoryDriver(); await migrate(driver); state.repo = repository(driver); await state.repo.addAccount({ id: 'a', name: 'Synthetic account', type: 'checking', currency: 'AUD', institution: 'Synthetic bank', mask_last4: null, opening_balance_minor: 0n }); HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
afterEach(cleanup);
it.each([['dark',50],['dark',51],['light',50],['light',51]] as const)('prompts only after more than fifty new transactions in %s (%i)',async(theme,count)=>{
 document.documentElement.dataset.theme=theme;
 const decimal=(minor:bigint)=>`${minor/100n}.${(minor%100n).toString().padStart(2,'0')}`;
 const csv='Date,Description,Amount\n'+Array.from({length:count},(_,i)=>`01/01/2026,Synthetic merchant,-${decimal(BigInt(i+1))}`).join('\n');
 await state.repo!.imports.stageFile('synthetic.csv',btoa(csv),hash(csv));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={()=>undefined}/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Read file'}));
 for(const [label,value] of [['Statement start','2026-01-01'],['Statement end','2026-01-31'],['Stated opening balance','0'],['Stated closing balance',`-${decimal(BigInt(count)*BigInt(count+1)/2n)}`]])fireEvent.change(screen.getByLabelText(label!),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Extract for review'}));await screen.findByText('✓ Balance check passed',{}, {timeout:10000});
 fireEvent.click(screen.getByRole('button',{name:'Confirm import'}));await waitFor(async()=>expect(await state.repo!.imports.ledger()).toHaveLength(count));
 if(count>50){await screen.findByRole('button',{name:'Back up'});fireEvent.click(screen.getByRole('button',{name:'Dismiss'}));expect(screen.queryByRole('button',{name:'Back up'})).toBeNull();}
 else expect(screen.queryByRole('button',{name:'Back up'})).toBeNull();
});

it('drops the backup prompt once the import it was for is rolled back',async()=>{
 const decimal=(minor:bigint)=>`${minor/100n}.${(minor%100n).toString().padStart(2,'0')}`;
 const csv='Date,Description,Amount\n'+Array.from({length:51},(_,i)=>`01/01/2026,Synthetic merchant,-${decimal(BigInt(i+1))}`).join('\n');
 await state.repo!.imports.stageFile('synthetic.csv',btoa(csv),hash(csv));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={()=>undefined}/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Read file'}));
 for(const [label,value] of [['Statement start','2026-01-01'],['Statement end','2026-01-31'],['Stated opening balance','0'],['Stated closing balance',`-${decimal(51n*52n/2n)}`]])fireEvent.change(screen.getByLabelText(label!),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Extract for review'}));await screen.findByText('✓ Balance check passed',{}, {timeout:10000});
 fireEvent.click(screen.getByRole('button',{name:'Confirm import'}));await screen.findByRole('button',{name:'Back up'});
 fireEvent.click(screen.getByRole('button',{name:'Roll back'}));fireEvent.click(screen.getByRole('button',{name:'Confirm rollback'}));
 await waitFor(async()=>expect(await state.repo!.imports.ledger()).toHaveLength(0));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Back up'})).toBeNull());
});

it('offers one import button on an empty ledger',async()=>{
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={()=>undefined}/></QueryClientProvider>);
 await screen.findByText('No transactions yet');
 expect(screen.getAllByRole('button').filter(b=>/^(Import|Choose) statements$/.test(b.textContent??''))).toHaveLength(1);
});

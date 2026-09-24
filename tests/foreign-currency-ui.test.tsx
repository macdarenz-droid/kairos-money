// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import type {Driver} from '../src/core/db/driver';
import {ForeignCurrency} from '../src/ui/screens/ForeignCurrency';
import {hash} from '../src/ingest/normalize';
let db:Driver;
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));const id=hash('manual-transaction:fx:entry');
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const {driver}=memoryDriver();db=driver;await migrate(driver);state.repo=repository(driver);await state.repo.addAccount({id:'a',name:'Synthetic',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});await state.repo.manual.save({id:'fx',kind:'expense',accountId:'a',destinationId:null,date:'2026-01-02',minor:'1500',description:'Synthetic',category:null,notes:''});});afterEach(cleanup);
it.each(['dark','light'])('records, edits and removes the source currency without changing a payment in %s',async theme=>{
 document.documentElement.dataset.theme=theme;render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ForeignCurrency id={id} code="AUD"/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Record original amount'}));fireEvent.change(screen.getByLabelText('Original positive amount'),{target:{value:'10.00'}});fireEvent.click(screen.getByRole('button',{name:'Save original amount'}));await screen.findByRole('alert');expect((await state.repo!.foreignCurrency.read(id)).value).toBeNull();
 fireEvent.change(screen.getByLabelText('Source of original amount'),{target:{value:'Synthetic receipt'}});fireEvent.click(screen.getByRole('button',{name:'Save original amount'}));await screen.findByText(/1 USD ≈ 1.500000 AUD/);
 fireEvent.click(screen.getByRole('button',{name:'Edit original amount'}));expect((screen.getByLabelText('Original positive amount') as HTMLInputElement).value).toBe('10.00');fireEvent.change(screen.getByLabelText('Original currency'),{target:{value:'JPY'}});fireEvent.change(screen.getByLabelText('Original positive amount'),{target:{value:'1000'}});fireEvent.click(screen.getByRole('button',{name:'Save original amount'}));await screen.findByText(/1 JPY ≈ 0.015000 AUD/);
 fireEvent.click(screen.getByRole('button',{name:'Remove original amount'}));expect((await state.repo!.foreignCurrency.read(id)).value).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'Confirm remove original amount'}));await waitFor(async()=>expect((await state.repo!.foreignCurrency.read(id)).value).toBeNull());expect((await state.repo!.manual.list())[0]?.minor).toBe('1500');
});

it('removes an unreadable original-currency note without losing its payment',async()=>{
 await db.execute('INSERT INTO app_settings(key,value) VALUES(?,?)',['foreign-amount:'+id,'{"originalMinor":"0"}']);
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ForeignCurrency id={id} code="AUD"/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Remove unreadable original amount'}));fireEvent.click(screen.getByRole('button',{name:'Confirm remove original amount'}));await screen.findByRole('button',{name:'Record original amount'});expect((await state.repo!.manual.list())[0]?.minor).toBe('1500');
});

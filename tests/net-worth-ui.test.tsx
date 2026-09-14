// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {NetWorth} from '../src/ui/screens/NetWorth';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});afterEach(cleanup);
it.each(['dark','light'])('records and removes a dated asset without a ledger transaction in %s',async theme=>{
 document.documentElement.dataset.theme=theme;const q=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={q}><NetWorth/></QueryClientProvider>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Record a value'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Record a value'}));
 fireEvent.change(screen.getByLabelText('Item name'),{target:{value:'Synthetic car'}});fireEvent.change(screen.getByLabelText('Valuation date'),{target:{value:'2026-01-01'}});fireEvent.change(screen.getByLabelText('Positive value or amount owed'),{target:{value:'12000.00'}});fireEvent.click(screen.getByRole('button',{name:'Save value'}));
 await waitFor(async()=>expect((await state.repo!.netWorth.list())[0]?.minor).toBe('1200000'));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 fireEvent.click(screen.getByText('Manage recorded values'));fireEvent.click(screen.getByRole('button',{name:'Remove'}));fireEvent.click(screen.getByRole('button',{name:'Remove value'}));await waitFor(async()=>expect(await state.repo!.netWorth.list()).toEqual([]));expect((await state.repo!.exportAll()).tables.transactions).toEqual([]);
});

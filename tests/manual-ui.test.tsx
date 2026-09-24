// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {ManualSheet} from '../src/ui/screens/Manual';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);await state.repo.addAccount({id:'a',name:'Cash',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});afterEach(cleanup);
it.each(['dark','light'])('saves a manual expense and reopens it for editing in %s',async theme=>{
 document.documentElement.dataset.theme=theme;const accounts=await state.repo!.accounts();const q=new QueryClient({defaultOptions:{queries:{retry:false}}});const closed=vi.fn();
 const view=render(<QueryClientProvider client={q}><ManualSheet accounts={accounts} onClose={closed}/></QueryClientProvider>);
 fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'12.50'}});fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Synthetic lunch'}});fireEvent.click(screen.getByRole('button',{name:'Save transaction'}));await waitFor(()=>expect(closed).toHaveBeenCalled());
 expect((await state.repo!.manual.list())[0]!.minor).toBe('1250');view.unmount();
 // Editing and deleting used to hang off every row of a "Manual transactions" list. That list is gone:
 // its rows are in History beside the imported ones, and its controls are in the transaction you open —
 // tests/history-list.test.tsx drives that path. What is left here is the sheet itself: that it opens on
 // an existing entry with the amount already in it, and that saving changes only that entry.
 const entry=(await state.repo!.manual.list())[0]!;
 render(<QueryClientProvider client={q}><ManualSheet accounts={accounts} entry={entry} onClose={closed}/></QueryClientProvider>);
 expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('12.50');fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'15.00'}});fireEvent.click(screen.getByRole('button',{name:'Save transaction'}));await waitFor(async()=>expect((await state.repo!.manual.list())[0]!.minor).toBe('1500'));
 await state.repo!.manual.remove(entry.id);expect(await state.repo!.manual.list()).toHaveLength(0);
});
it('offers only open accounts when adding a transaction',async()=>{
 await state.repo!.addAccount({id:'old',name:'Closed card',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 await state.repo!.updateAccount('old',{archived:true});
 const q=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={q}><ManualSheet accounts={await state.repo!.accounts()} onClose={()=>{}}/></QueryClientProvider>);
 expect(screen.getAllByRole('option').map(o=>o.textContent)).not.toContain('Closed card · AUD');
});

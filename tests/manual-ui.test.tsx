// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {ManualSheet,ManualHistory} from '../src/ui/screens/Manual';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);await state.repo.addAccount({id:'a',name:'Cash',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});afterEach(cleanup);
it.each(['dark','light'])('saves a manual expense and edits/deletes history in %s',async theme=>{
 document.documentElement.dataset.theme=theme;const accounts=await state.repo!.accounts();const q=new QueryClient({defaultOptions:{queries:{retry:false}}});const closed=vi.fn();
 const view=render(<QueryClientProvider client={q}><ManualSheet accounts={accounts} onClose={closed}/></QueryClientProvider>);
 fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'12.50'}});fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Synthetic lunch'}});fireEvent.click(screen.getByRole('button',{name:'Save transaction'}));await waitFor(()=>expect(closed).toHaveBeenCalled());
 expect((await state.repo!.manual.list())[0]!.minor).toBe('1250');view.unmount();
 render(<QueryClientProvider client={q}><ManualHistory accounts={accounts}/></QueryClientProvider>);fireEvent.click(await screen.findByRole('button',{name:'Edit'}));expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('12.50');fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'15.00'}});fireEvent.click(screen.getByRole('button',{name:'Save transaction'}));await waitFor(async()=>expect((await state.repo!.manual.list())[0]!.minor).toBe('1500'));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());fireEvent.click(screen.getByRole('button',{name:'Delete'}));fireEvent.click(screen.getByRole('button',{name:'Delete transaction'}));await waitFor(async()=>expect(await state.repo!.manual.list()).toHaveLength(0));
});

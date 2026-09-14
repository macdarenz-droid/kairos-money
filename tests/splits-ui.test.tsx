// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {TransactionSplits} from '../src/ui/screens/TransactionSplits';
import {hash,normalizeRow} from '../src/ingest/normalize';
import type {Document,ImportContext} from '../src/ingest/types';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));let id:string;
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);await state.repo.addAccount({id:'a',name:'Synthetic',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});const context:ImportContext={accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-01-01',end:'2026-01-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};const doc:Document={id:hash(JSON.stringify(['a',hash('file')])),hash:hash('file'),fileName:'synthetic.csv',parser:'synthetic',context,opening:'10000',closing:'9000',payslip:null,rows:[{...normalizeRow({sourceId:'1',date:'2026-01-02',description:'Synthetic store',amount:'-10.00',confidence:10000},context),category:'Shopping',verified:true}]};await state.repo.imports.stage(doc);await state.repo.imports.commit(doc.id);id=(await state.repo.imports.ledger())[0]!.id;});
afterEach(cleanup);
it.each(['dark','light'])('validates, saves, edits and removes a category split in %s',async theme=>{
 document.documentElement.dataset.theme=theme;render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TransactionSplits id={id} minor="-1000" code="AUD"/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Split this expense'}));fireEvent.change(screen.getByLabelText('Amount 1'),{target:{value:'6.00'}});fireEvent.change(screen.getByLabelText('Amount 2'),{target:{value:'5.00'}});fireEvent.click(screen.getByRole('button',{name:'Save category split'}));await screen.findByRole('alert');expect(await state.repo!.splits.get(id)).toBeNull();
 fireEvent.change(screen.getByLabelText('Amount 2'),{target:{value:'4.00'}});fireEvent.click(screen.getByRole('button',{name:'Save category split'}));await screen.findByRole('button',{name:'Edit category split'});expect((await state.repo!.splits.get(id))?.parts.map(p=>p.minor)).toEqual(['600','400']);
 fireEvent.click(screen.getByRole('button',{name:'Edit category split'}));fireEvent.change(screen.getByLabelText('Category 2'),{target:{value:'Eating out'}});fireEvent.click(screen.getByRole('button',{name:'Save category split'}));await screen.findByRole('button',{name:'Edit category split'});expect((await state.repo!.splits.get(id))?.parts[1]?.category).toBe('Eating out');
 fireEvent.click(screen.getByRole('button',{name:'Remove split'}));expect(await state.repo!.splits.get(id)).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'Confirm remove split'}));await waitFor(async()=>expect(await state.repo!.splits.get(id)).toBeNull());await screen.findByRole('button',{name:'Split this expense'});
});

// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BulkCategories} from '../src/ui/screens/BulkCategories';
import {FirstImport} from '../src/ui/screens/FirstImport';
import type {LedgerRow} from '../src/ingest/types';
import {normalizeRow} from '../src/ingest/normalize';
const state=vi.hoisted(()=>({save:vi.fn().mockResolvedValue(undefined),rows:[] as unknown[]}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:(fn:(repo:{categories:{set:typeof state.save};imports:{ledgerBulk:()=>Promise<{rows:unknown[];total:number}>}})=>Promise<void>)=>fn({categories:{set:state.save},imports:{ledgerBulk:()=>Promise.resolve({rows:state.rows,total:state.rows.length})}})})}));
afterEach(()=>{cleanup();state.save.mockClear();});
it.each(['dark','light'])('selects only eligible rows and submits a category in %s',async theme=>{
 document.documentElement.dataset.theme=theme;HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const row:LedgerRow={...normalizeRow({sourceId:'one',date:'2026-01-01',amount:'-10.00',description:'Synthetic store',confidence:10000},{accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-01-01',end:'2026-01-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false}),id:'one',accountId:'a',transferGroup:null,sources:[],owner:'source'};
 // Matched transfers are excluded by the bulk read now; see tests/ledger-workspace-read.test.ts.
 state.rows=[row];
 const close=vi.fn(),query=new QueryClient();render(<QueryClientProvider client={query}><BulkCategories onClose={close}/></QueryClientProvider>);
 expect(await screen.findAllByRole('checkbox')).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Select matching rows'}));fireEvent.change(screen.getByLabelText('Apply category'),{target:{value:'Groceries'}});fireEvent.click(screen.getByRole('button',{name:'Save categories'}));await waitFor(()=>expect(close).toHaveBeenCalled());expect(state.save).toHaveBeenCalledWith(['one'],'Groceries');
});
it('offers both starting points, routes each to its real action, and waits on accounts for the import one',()=>{
 const account=vi.fn(),read=vi.fn(),record=vi.fn();
 const props={hasAccount:false,onAccount:account,onRead:read,onRecord:record};
 const view=render(<FirstImport {...props} loading/>);

 // Recording a purchase needs nothing set up, so it is never blocked by accounts still loading.
 const recordButton=screen.getByRole('button',{name:'Record a purchase'});
 expect((recordButton as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(recordButton);
 expect(record).toHaveBeenCalledOnce();

 // The import path does need an account, so it waits, saying so, then routes to setting one up.
 expect((screen.getByRole('button',{name:'Reading accounts…'}) as HTMLButtonElement).disabled).toBe(true);
 view.rerender(<FirstImport {...props} loading={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Set up the account first'}));
 expect(account).toHaveBeenCalledOnce();

 // With an account, the same path goes straight to choosing the file.
 view.rerender(<FirstImport {...props} hasAccount loading={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'Choose a statement file'}));
 expect(read).toHaveBeenCalledOnce();

 // The four-step explanation is still available, behind a disclosure rather than in the way.
 expect(screen.getAllByRole('listitem')).toHaveLength(4);
});

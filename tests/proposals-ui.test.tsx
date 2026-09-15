// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BulkProposals} from '../src/ui/screens/BulkProposals';
import {ManualHistory,ManualSheet} from '../src/ui/screens/Manual';
import type {Account} from '../src/core/db/repository';
import type {ManualEntry} from '../src/ledger/manual';

HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};

const state=vi.hoisted(()=>({rows:[] as unknown[],entries:[] as unknown[],setCategory:vi.fn().mockResolvedValue(undefined),
 save:vi.fn().mockResolvedValue(undefined),writePreference:vi.fn().mockResolvedValue(undefined),preference:null as string|null}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:(fn:(repo:Record<string,unknown>)=>Promise<unknown>)=>fn({
 imports:{ledgerBulk:()=>Promise.resolve({rows:state.rows,total:state.rows.length})},
 categories:{set:state.setCategory},
 manual:{list:()=>Promise.resolve(state.entries),today:()=>Promise.resolve([]),unresolved:()=>Promise.resolve({}),save:state.save},
 preferences:{read:()=>Promise.resolve(state.preference),write:state.writePreference},
})})}));
const accounts:Account[]=[{id:'a',name:'Everyday',institution:'Bank',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0,archived_at:null} as unknown as Account];
const wrap=(ui:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);
const ledgerRow=(id:string,category:string|null)=>({id,sourceId:id,date:'2026-03-01',minor:'-1500',currency:'AUD',
 description:'WOOLWORTHS',merchant:'Woolworths',category,confidence:10000,issues:[],duplicateOf:null,occurrence:'',
 createRule:false,pending:false,verified:false,fingerprint:id.padStart(64,'0'),mcc:null,accountId:'a',reference:'',
 owner:'source',transferGroup:null,sources:[]});
const entry=(over:Partial<ManualEntry>&{id:string}):ManualEntry=>({kind:'expense',accountId:'a',destinationId:null,
 date:'2026-03-01',minor:'1500',description:'Cafe Mika',category:'Eating out',notes:'',links:{},...over});
afterEach(()=>{cleanup();state.setCategory.mockClear();state.save.mockClear();state.writePreference.mockClear();state.preference=null;});

it.each(['dark','light'])('applies a whole merchant group in one tap in %s',async theme=>{
 document.documentElement.dataset.theme=theme;
 state.rows=[ledgerRow('k',   'Groceries'),ledgerRow('u1',null),ledgerRow('u2',null),ledgerRow('u3',null)];
 wrap(<BulkProposals/>);
 const button=await screen.findByRole('button',{name:/3 uncategorised from woolworths/i});
 // The label names the figure and the reason, so a screen reader hears both.
 expect(button.getAttribute('aria-label')).toContain('already filed');
 fireEvent.click(button);
 await waitFor(()=>expect(state.setCategory).toHaveBeenCalledWith(['u1','u2','u3'],'Groceries'));
});

it('offers nothing when the merchant has no category the user chose',async()=>{
 state.rows=[ledgerRow('u1',null),ledgerRow('u2',null),ledgerRow('u3',null)];
 const {container}=wrap(<BulkProposals/>);
 await waitFor(()=>expect(container.textContent).not.toContain('Ready to categorise'));
 expect(state.setCategory).not.toHaveBeenCalled();
});

it('prefills a repeat entry without saving it, leaving Save to press',async()=>{
 state.entries=[entry({id:'e1',description:'Cafe Mika'})];
 wrap(<ManualHistory accounts={accounts}/>);
 const tile=await screen.findByRole('button',{name:/Record Cafe Mika/});
 fireEvent.click(tile);
 // The sheet opens with the entry's own values and nothing is committed yet.
 await waitFor(()=>expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('15.00'));
 expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Cafe Mika');
 expect(state.save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Save transaction'}));
 await waitFor(()=>expect(state.save).toHaveBeenCalledOnce());
});

it('puts amount first, offers date and category chips, and keeps the full category list',async()=>{
 state.entries=[entry({id:'1',category:'Groceries'}),entry({id:'2',category:'Groceries'})];
 wrap(<ManualSheet accounts={accounts} onClose={()=>undefined}/>);
 await waitFor(()=>expect(screen.getByLabelText('Amount')).toBeTruthy());
 const labels=[...document.querySelectorAll('label')].map(l=>l.textContent??'');
 expect(labels.findIndex(t=>t.startsWith('Amount'))).toBeLessThan(labels.findIndex(t=>t.startsWith('Description')));
 expect(screen.getByRole('button',{name:'Today'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Yesterday'})).toBeTruthy();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Groceries'})).toBeTruthy());
 // No feature is removed: the full category select is still present behind the chips.
 const select=screen.getByLabelText('Category') as HTMLSelectElement;
 expect(select.querySelectorAll('option').length).toBeGreaterThan(5);
});

it('remembers the account chosen on save, as a preference',async()=>{
 wrap(<ManualSheet accounts={accounts} onClose={()=>undefined}/>);
 await waitFor(()=>expect(screen.getByLabelText('Amount')).toBeTruthy());
 fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'12.50'}});
 fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Lunch'}});
 fireEvent.click(screen.getByRole('button',{name:'Save transaction'}));
 await waitFor(()=>expect(state.writePreference).toHaveBeenCalledWith('preferred-account','a'));
 expect(state.save).toHaveBeenCalledOnce();
});

// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ManualHistory} from '../src/ui/screens/Manual';
import {repeatEntryProposals} from '../src/ui/proposals/derive';
import type {Account} from '../src/core/db/repository';
import type {ManualEntry} from '../src/ledger/manual';

const entry=(over:Partial<ManualEntry>&{id:string}):ManualEntry=>({kind:'expense',accountId:'a',destinationId:null,
 date:'2026-03-01',minor:'1500',description:'Synthetic usability probe',category:null,notes:'',links:{},...over});

it('keeps a proposal identity stable when another entry joins the group it represents',()=>{
 // The tile is keyed on this id in React. These proposals are deduplicated by description, amount and
 // account, so several entries share one tile; keying on whichever entry represents the group meant the
 // identity changed the moment a newer duplicate arrived.
 const before=repeatEntryProposals([entry({id:'e1'})],'2026-09-15');
 const after=repeatEntryProposals([entry({id:'e1'}),entry({id:'e2',date:'2026-09-15'})],'2026-09-15');
 expect(after).toHaveLength(1);
 expect(after[0]!.id).toBe(before[0]!.id);
 // The evidence still names a specific entry, so "why is this offered" is still answerable.
 expect(after[0]!.evidence).toHaveLength(1);
});

it('gives genuinely different repeats different identities',()=>{
 const proposals=repeatEntryProposals([entry({id:'e1'}),entry({id:'e2',minor:'9900'})],'2026-09-15');
 expect(new Set(proposals.map(p=>p.id)).size).toBe(2);
});

HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const state=vi.hoisted(()=>({entries:[] as unknown[]}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:(fn:(repo:Record<string,unknown>)=>Promise<unknown>)=>fn({
 manual:{list:()=>Promise.resolve(state.entries),today:()=>Promise.resolve([]),unresolved:()=>Promise.resolve({}),
  save:(e:ManualEntry)=>{state.entries=[...state.entries,{...e,id:'n'+state.entries.length}];return Promise.resolve();},
  candidates:()=>Promise.resolve([])},
 preferences:{read:()=>Promise.resolve(null),write:()=>Promise.resolve()},
})})}));
const accounts:Account[]=[{id:'a',name:'Everyday',institution:'Bank',type:'checking',currency:'AUD',
 mask_last4:null,opening_balance_minor:0,archived_at:null} as unknown as Account];
afterEach(cleanup);
const tile=()=>screen.findByRole('button',{name:/Record Synthetic usability probe/});

it('survives saving from it, so the next tap is not lost',async()=>{
 // Recording the same expense twice in a row is what a repeat tile is for, and it was the case that broke:
 // saving created a duplicate, the tile's identity moved to the new entry, React destroyed and rebuilt the
 // button that had just been pressed, and a tap landing in that window reached a detached node and did
 // nothing at all — no error, no sheet.
 state.entries=[entry({id:'e1'})];
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
  <ManualHistory accounts={accounts} today/></QueryClientProvider>);

 fireEvent.click(await tile());
 fireEvent.click(await screen.findByRole('button',{name:'Save transaction'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Save transaction'})).toBeNull());

 // Deliberately no settling pause: tapping straight after the save is the whole point.
 const second=await tile();
 expect(document.contains(second)).toBe(true);
 fireEvent.click(second);
 await screen.findByRole('button',{name:'Save transaction'});
 expect(document.contains(second)).toBe(true);
});

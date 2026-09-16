// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Analysis} from '../src/ui/screens/Analysis';
import type {Snapshot,Transaction} from '../src/intelligence/model';
import {currency} from '../src/core/money';

const AUD=currency('AUD');
const today=new Date().toISOString().slice(0,10),period=today.slice(0,7);
const ninetyBack=new Date(Date.parse(today)-120*86400000).toISOString().slice(0,10);
function row(over:Partial<Transaction>&{id:string}):Transaction{
 return {accountId:'a',date:period+'-02',minor:'-1500',currency:AUD,description:'Cafe Mika',category:'Eating out',kind:'discretionary',status:'settled',transfer:false,recurring:false,...over};
}
const snapshot=vi.hoisted(()=>({current:null as unknown}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:(fn:(repo:{intelligence:{snapshot:()=>Promise<unknown>}})=>Promise<unknown>)=>fn({intelligence:{snapshot:()=>Promise.resolve(snapshot.current)}})})}));
function build(over:Partial<Snapshot>={}):Snapshot{
 return {asOf:today,currency:AUD,accountIds:['a'],coverage:[{accountId:'a',start:ninetyBack,end:today,tier:'A'}],pays:[],
  transactions:[row({id:'a',minor:'-10000'}),row({id:'b',minor:'-400',date:period+'-03'}),row({id:'pay',minor:'500000',kind:'income',date:period+'-01'})],...over};
}
// jsdom has no dialog implementation; the Sheet primitive uses a real <dialog>.
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const show=async(over:Partial<Snapshot>={})=>{
 snapshot.current=build(over);
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Analysis/></QueryClientProvider>);
 await screen.findByText('Money analysis');
};
afterEach(cleanup);

it.each(['dark','light'])('answers what the measures are for, and never counts them in %s',async theme=>{
 document.documentElement.dataset.theme=theme;
 await show();
 // The thirty-six are the engine, not the subject. Nothing on this screen reports the app's own
 // inventory: no "12 of 36", no grid of squares, no roll-call to scroll.
 expect(document.body.textContent).not.toMatch(/of 36/);
 expect(screen.queryByText('Every measure, one by one')).toBeNull();
 expect(screen.queryByText(/measures are waiting/)).toBeNull();
 // What replaces them is the questions they exist to answer, stated as answers.
 expect(screen.getByLabelText('What your money does')).toBeTruthy();
 expect(screen.getByText('Top category')).toBeTruthy();
 expect(screen.getByText('Left over')).toBeTruthy();
});

it('reaches the evidence behind a figure in two taps',async()=>{
 await show();
 // The roll-call is gone, but the route it provided is not: every answer opens the rows behind it.
 const buttons=screen.getAllByRole('button',{name:/Transactions|Top category|Left over/});
 expect(buttons.length).toBeGreaterThan(0);
 fireEvent.click(buttons[0]!);
 await waitFor(()=>expect(document.querySelector('dialog[open]')).toBeTruthy());
 // The evidence must be readable transactions. It used to list internal ids, which are hashes: forty
 // lines of hex answering "which transactions?" with nothing a person can check against a statement.
 const sheet=document.querySelector('dialog[open]')??document.body;
 expect(sheet.textContent).not.toMatch(/\b[0-9a-f]{32,}\b/);
});

it('says one short thing when it cannot answer, not a list of what it cannot answer',async()=>{
 snapshot.current={...build(),coverage:[{accountId:'a',start:today,end:today,tier:'A'}]};
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Analysis/></QueryClientProvider>);
 await screen.findByText('Money analysis');
 // A thin ledger used to produce thirty-six rows of "not enough evidence", then "0 of 36". Both were the
 // app reporting on itself. An unanswerable question is now absent rather than present and empty.
 expect(document.body.textContent).not.toMatch(/of 36/);
 expect(screen.queryByText('Top category')).toBeNull();
 expect(screen.getByText(/Not enough imported history yet/)).toBeTruthy();
 expect(screen.getAllByText(/Not enough imported history yet/)).toHaveLength(1);
});

it('keeps a modelled amount visibly separate from what happened, and never calls it saved',async()=>{
 await show();
 const modelled=screen.queryByText('Modelled');
 if(modelled){
  expect(screen.getByText('What happened')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/\bsaved\b/i);
 }
 // Conditional wording is present wherever a hypothesis is shown.
 for(const note of screen.queryAllByText(/A modelled amount, not an amount saved/))expect(note).toBeTruthy();
});

it('asks nothing and instructs nothing anywhere on the screen',async()=>{
 await show();
 const text=document.body.textContent??'';
 expect(text).not.toContain('?');
 expect(text).not.toMatch(/\b(try|consider|you should|why not|cut back|reduce your)\b/i);
});

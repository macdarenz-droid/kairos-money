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

it.each(['dark','light'])('renders every measure with its coverage in %s',async theme=>{
 document.documentElement.dataset.theme=theme;
 await show();
 // All 36 capabilities are listed, whether or not they had enough evidence.
 expect(screen.getByText(/of 36 with enough evidence/)).toBeTruthy();
 expect(screen.getByText('Largest category')).toBeTruthy();
 expect(screen.getByText('Left after essentials')).toBeTruthy();
});

it('reaches the evidence behind a figure in two taps',async()=>{
 await show();
 const buttons=screen.getAllByRole('button',{name:'Show evidence'});
 expect(buttons.length).toBeGreaterThan(0);
 fireEvent.click(buttons[0]!);
 await waitFor(()=>expect(screen.getByText(/These transaction records produced this figure/)).toBeTruthy());
 expect(screen.getByText(/Covered days/)).toBeTruthy();
});

it('states a measure without enough evidence rather than showing a zero',async()=>{
 snapshot.current={...build(),coverage:[{accountId:'a',start:today,end:today,tier:'A'}]};
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Analysis/></QueryClientProvider>);
 await screen.findByText('Money analysis');
 expect(screen.getAllByText(/At least 20 covered days/).length).toBeGreaterThan(0);
 expect(screen.getByText('0 of 36 with enough evidence')).toBeTruthy();
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

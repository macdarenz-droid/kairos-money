// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {Repository} from '../src/core/db/repository';
import {Cancellations} from '../src/ui/screens/Cancellations';
import {ForeignCurrency} from '../src/ui/screens/ForeignCurrency';
import {currency} from '../src/core/money';

const state=vi.hoisted(()=>({repo:undefined as unknown as Repository}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo)})}));
// jsdom has no dialog implementation; the Sheet primitive opens one. Same stub the other UI tests use.
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
afterEach(cleanup);
const wrap=(node:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{node}</QueryClientProvider>);

it('offers Today and Yesterday when recording a cancellation, without removing the date field',async()=>{
 const saved:unknown[]=[];
 state.repo={cancellations:{list:async()=>[],save:async(v:unknown)=>{saved.push(v);},remove:async()=>{}}} as unknown as Repository;
 wrap(<Cancellations code={currency('AUD')} merchants={['Streaming Co']}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Record cancellation · Streaming Co'}));

 const today=screen.getByRole('button',{name:/Set the contact date to today/});
 const yesterday=screen.getByRole('button',{name:/Set the contact date to yesterday/});
 // The typed date field is still there: a shortcut is added beside it, never in place of it.
 const field=screen.getByLabelText('Contact or confirmation date') as HTMLInputElement;
 const todayValue=field.value;
 expect(today.getAttribute('aria-pressed')).toBe('true');

 fireEvent.click(yesterday);
 await waitFor(()=>expect((screen.getByLabelText('Contact or confirmation date') as HTMLInputElement).value).not.toBe(todayValue));
 expect(screen.getByRole('button',{name:/Set the contact date to yesterday/}).getAttribute('aria-pressed')).toBe('true');

 // One tap set the date; saving is still a separate press.
 expect(saved).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Save cancellation record'}));
 await waitFor(()=>expect(saved).toHaveLength(1));
});

it('offers the original amount the statement line already states, and still requires Save',async()=>{
 const saved:unknown[]=[];
 state.repo={
  foreignCurrency:{read:async()=>({value:null,description:'AMAZON MKTPLACE USD 45.00',active:false}),
   save:async(_id:string,v:unknown)=>{saved.push(v);},remove:async()=>{}},
  preferences:{read:async()=>null,write:async()=>{},clear:async()=>{}},
 } as unknown as Repository;
 wrap(<ForeignCurrency id="t1" code={currency('AUD')}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Record original amount'}));

 const offer=await screen.findByRole('button',{name:/Use 45.00 USD stated on the statement line/});
 fireEvent.click(offer);

 // All three fields filled from the line, and the source note cites it rather than asserting anything.
 await waitFor(()=>expect((screen.getByLabelText('Original positive amount') as HTMLInputElement).value).toBe('45.00'));
 expect((screen.getByLabelText('Original currency') as HTMLSelectElement).value).toBe('USD');
 expect((screen.getByLabelText('Source of original amount') as HTMLInputElement).value)
  .toBe('Stated on the imported statement line: AMAZON MKTPLACE USD 45.00');
 expect(saved).toHaveLength(0);

 fireEvent.click(screen.getByRole('button',{name:'Save original amount'}));
 await waitFor(()=>expect(saved).toHaveLength(1));
 expect(saved[0]).toMatchObject({originalCurrency:'USD',originalMinor:'4500'});
});

it('offers nothing when the statement line states no original amount',async()=>{
 state.repo={
  foreignCurrency:{read:async()=>({value:null,description:'WOOLWORTHS 1234',active:false}),save:async()=>{},remove:async()=>{}},
  preferences:{read:async()=>null,write:async()=>{},clear:async()=>{}},
 } as unknown as Repository;
 wrap(<ForeignCurrency id="t2" code={currency('AUD')}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Record original amount'}));
 await screen.findByLabelText('Original positive amount');
 expect(screen.queryByRole('button',{name:/from the statement line/})).toBeNull();
});

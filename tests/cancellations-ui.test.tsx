// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {Cancellations} from '../src/ui/screens/Cancellations';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
afterEach(cleanup);
it.each(['dark','light'])('records provider confirmation and retains it when the pattern disappears in %s',async theme=>{
 document.documentElement.dataset.theme=theme;const q=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const review=vi.fn(),onTrack=vi.fn();
 const view=(track:string|null)=><QueryClientProvider client={q}><Cancellations code="AUD" track={track} onTrack={onTrack} payments={[{merchant:"Synthetic membership",date:"2026-02-01",id:"later"},{merchant:"Another merchant",date:"2026-02-01",id:"other"}]} review={review}/></QueryClientProvider>;
 const rendered=render(view('Synthetic membership'));
 await screen.findByRole('dialog',{name:'Cancellation record'});expect(onTrack).toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Contact or confirmation date'),{target:{value:'2026-01-01'}});
 fireEvent.change(screen.getByLabelText('Progress'),{target:{value:'confirmed'}});
 fireEvent.click(screen.getByRole('button',{name:'Save cancellation record'}));
 await screen.findByRole('alert');expect(await state.repo!.cancellations.list()).toEqual([]);
 fireEvent.change(screen.getByLabelText('Confirmation reference or note'),{target:{value:'Provider reference ABC'}});
 fireEvent.click(screen.getByRole('button',{name:'Save cancellation record'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect((await state.repo!.cancellations.list())[0]).toMatchObject({status:'confirmed',note:'Provider reference ABC'});
 rendered.rerender(view(null));await screen.findByText('Provider reference ABC');
 fireEvent.click(screen.getByRole('button',{name:'Review 1 later payment'}));expect(review).toHaveBeenCalledWith('synthetic membership',['later']);
 fireEvent.click(screen.getByRole('button',{name:'Edit record'}));fireEvent.change(screen.getByLabelText('Progress'),{target:{value:'requested'}});fireEvent.click(screen.getByRole('button',{name:'Save cancellation record'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect((await state.repo!.cancellations.list())[0]!.status).toBe('requested');
 fireEvent.click(screen.getByRole('button',{name:'Remove record'}));expect(await state.repo!.cancellations.list()).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Remove cancellation record'}));
 // With no repeating payment to cancel and nothing recorded, the section has no subject left and leaves
 // the screen, rather than staying to report that it is empty.
 await waitFor(()=>expect(document.querySelector('.cancellation-records')).toBeNull());
 expect(await state.repo!.cancellations.list()).toEqual([]);
});

// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import App from '../src/ui/App';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined,session:'ready',pending:'widget' as string|null,peek:vi.fn(),acknowledge:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true},registerPlugin:(name:string)=>name==='KairosLaunch'?{peek:state.peek,acknowledge:state.acknowledge}:{}}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:state.session,run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!),lock:async()=>undefined})}));
beforeEach(async()=>{
 const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);state.session='ready';state.pending='widget';state.peek.mockReset();state.acknowledge.mockReset();
 state.peek.mockImplementation(async()=>({requestId:state.pending}));
 state.acknowledge.mockImplementation(async({requestId}:{requestId:string})=>{
  // Assert the actual product destination exists before native consumes the tap.
  const dialog=screen.getByRole('dialog');expect(dialog.hasAttribute('open')).toBe(true);
  expect(state.session).toBe('ready');const acknowledged=state.pending===requestId;if(acknowledged)state.pending=null;return {acknowledged};
 });
 window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}});
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
afterEach(cleanup);
function mount(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const tree=()=> <QueryClientProvider client={client}><App/></QueryClientProvider>;
 const view=render(tree());return {client,refresh:()=>view.rerender(tree())};
}
it.each(['dark','light'])('waits for loaded accounts and a visible entry before acknowledgement in %s',async theme=>{
 document.documentElement.dataset.theme=theme;
 await state.repo!.addAccount({id:'a',name:'Synthetic cash',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const original=state.repo!.accounts;let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});
 vi.spyOn(state.repo!,'accounts').mockImplementation(async()=>{await pending;return original();});
 mount();await waitFor(()=>expect(state.peek).toHaveBeenCalled());
 expect(state.acknowledge).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
 await act(async()=>release());await screen.findByRole('dialog',{name:'Add transaction'});
 await waitFor(()=>expect(state.pending).toBeNull());expect(state.acknowledge).toHaveBeenCalledWith({requestId:'widget'});
});
it('acknowledges the account setup route when the ledger has no accounts',async()=>{
 mount();await screen.findByRole('dialog',{name:'Add an account'});
 await waitFor(()=>expect(state.pending).toBeNull());
});
it('replays a bridge result interrupted by backgrounding, then does not reopen after acknowledgement',async()=>{
 await state.repo!.addAccount({id:'a',name:'Synthetic cash',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 let resolve!:(value:{requestId:string|null})=>void;
 state.peek.mockImplementationOnce(()=>new Promise<{requestId:string|null}>(done=>{resolve=done;}));
 const view=mount();await waitFor(()=>expect(resolve).toBeDefined());
 state.session='background';view.refresh();await act(async()=>resolve({requestId:'widget'}));
 expect(state.acknowledge).not.toHaveBeenCalled();expect(state.pending).toBe('widget');
 state.session='ready';view.refresh();await screen.findByRole('dialog',{name:'Add transaction'});
 await waitFor(()=>expect(state.pending).toBeNull());fireEvent.click(screen.getByRole('button',{name:'Close Add transaction'}));
 state.session='background';view.refresh();state.session='ready';view.refresh();
 await waitFor(()=>expect(state.peek).toHaveBeenCalledTimes(3));expect(screen.queryByRole('dialog')).toBeNull();
});

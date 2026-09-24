// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({peek:vi.fn(),acknowledge:vi.fn(),enabled:true,pending:null as string|null}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>native.enabled},registerPlugin:()=>({peek:native.peek,acknowledge:native.acknowledge})}));
import {useQuickAddLaunch} from '../src/ui/quick-add';
beforeEach(()=>{
 native.enabled=true;native.pending=null;native.peek.mockReset();native.acknowledge.mockReset();
 native.peek.mockImplementation(async()=>({requestId:native.pending}));
 native.acknowledge.mockImplementation(async({requestId}:{requestId:string})=>{
  const acknowledged=native.pending===requestId;if(acknowledged)native.pending=null;return {acknowledged};
 });
});
afterEach(cleanup);
const props=(ready:boolean,displayed:string|null=null)=>({ready,displayed});
function mount(open:(id:string)=>void,ready=true){
 return renderHook(({ready,displayed})=>useQuickAddLaunch(ready,open,displayed),{initialProps:props(ready)});
}
function tap(id:string){native.pending=id;act(()=>window.dispatchEvent(new Event('kairosQuickAdd')));}
it('defers a cold widget request until unlock and acknowledges only after display',async()=>{
 const open=vi.fn();native.pending='cold';const hook=mount(open,false);
 expect(native.peek).not.toHaveBeenCalled();hook.rerender(props(true));
 await waitFor(()=>expect(open).toHaveBeenCalledWith('cold'));
 expect(native.pending).toBe('cold');expect(native.acknowledge).not.toHaveBeenCalled();
 hook.rerender(props(true,'cold'));await waitFor(()=>expect(native.pending).toBeNull());
});
it('handles another warm tap after the previous request was acknowledged',async()=>{
 const open=vi.fn();const hook=mount(open);await waitFor(()=>expect(native.peek).toHaveBeenCalledOnce());
 tap('first');await waitFor(()=>expect(open).toHaveBeenCalledWith('first'));
 hook.rerender(props(true,'first'));await waitFor(()=>expect(native.pending).toBeNull());
 hook.rerender(props(true));tap('second');await waitFor(()=>expect(open).toHaveBeenLastCalledWith('second'));
 expect(open).toHaveBeenCalledTimes(2);
});
it('retains a request when the session pauses before bridge completion',async()=>{
 const open=vi.fn();const hook=mount(open);await waitFor(()=>expect(native.peek).toHaveBeenCalledOnce());
 let resolve!: (value:{requestId:string|null})=>void;
 native.peek.mockImplementationOnce(()=>new Promise<{requestId:string|null}>(done=>{resolve=done;}));
 tap('interrupted');await waitFor(()=>expect(resolve).toBeDefined());hook.rerender(props(false));
 await act(async()=>resolve({requestId:'interrupted'}));
 expect(open).not.toHaveBeenCalled();expect(native.pending).toBe('interrupted');
 hook.rerender(props(true));await waitFor(()=>expect(open).toHaveBeenCalledWith('interrupted'));
 hook.rerender(props(true,'interrupted'));await waitFor(()=>expect(native.pending).toBeNull());
 hook.rerender(props(false));hook.rerender(props(true));await waitFor(()=>expect(native.peek).toHaveBeenCalledTimes(4));
 expect(open).toHaveBeenCalledOnce();
});
it('keeps a requested route pending until it is displayed after the session resumes',async()=>{
 const open=vi.fn();native.pending='loading';const hook=mount(open);
 await waitFor(()=>expect(open).toHaveBeenCalledWith('loading'));
 hook.rerender(props(false));expect(native.acknowledge).not.toHaveBeenCalled();
 hook.rerender(props(true));await waitFor(()=>expect(open).toHaveBeenCalledTimes(2));
 hook.rerender(props(true,'loading'));await waitFor(()=>expect(native.pending).toBeNull());
});
it('ignores an older bridge read that resolves after a newer tap',async()=>{
 const open=vi.fn();mount(open);await waitFor(()=>expect(native.peek).toHaveBeenCalledOnce());
 let resolve!: (value:{requestId:string|null})=>void;
 native.peek.mockImplementationOnce(()=>new Promise<{requestId:string|null}>(done=>{resolve=done;}));
 tap('older');await waitFor(()=>expect(resolve).toBeDefined());tap('newer');
 await waitFor(()=>expect(open).toHaveBeenCalledWith('newer'));
 await act(async()=>resolve({requestId:'older'}));expect(open).toHaveBeenCalledOnce();
});
it('does not invoke the Android bridge on web',()=>{
 native.enabled=false;renderHook(()=>useQuickAddLaunch(true,vi.fn(),'unused'));
 expect(native.peek).not.toHaveBeenCalled();expect(native.acknowledge).not.toHaveBeenCalled();
});
it('discloses bridge failure and clears it after a successful retry',async()=>{
 native.peek.mockRejectedValueOnce(new Error('Native unavailable'));const open=vi.fn();const hook=mount(open);
 await waitFor(()=>expect(hook.result.current).toContain('Quick add could not open'));
 tap('retry');await waitFor(()=>expect(open).toHaveBeenCalledWith('retry'));expect(hook.result.current).toBe('');
});
it('retains the request if acknowledgement fails',async()=>{
 native.pending='retry-ack';native.acknowledge.mockRejectedValueOnce(new Error('Disconnected'));
 const open=vi.fn();const hook=mount(open);await waitFor(()=>expect(open).toHaveBeenCalledWith('retry-ack'));
 hook.rerender(props(true,'retry-ack'));await waitFor(()=>expect(hook.result.current).toContain('could not be confirmed'));
 expect(native.pending).toBe('retry-ack');hook.rerender(props(false));hook.rerender(props(true));
 await waitFor(()=>expect(open).toHaveBeenCalledTimes(2));
 hook.rerender(props(true,'retry-ack'));await waitFor(()=>expect(native.pending).toBeNull());
});

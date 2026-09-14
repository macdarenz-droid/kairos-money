// @vitest-environment jsdom
import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({consume:vi.fn(),enabled:true}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>native.enabled},registerPlugin:()=>({consume:native.consume})}));
import {useQuickAddLaunch} from '../src/ui/quick-add';
beforeEach(()=>{native.enabled=true;native.consume.mockReset();native.consume.mockResolvedValue({addTransaction:false});});
it('defers a cold widget request until the session is unlocked',async()=>{
 const open=vi.fn();native.consume.mockResolvedValueOnce({addTransaction:true});
 const hook=renderHook(({ready})=>useQuickAddLaunch(ready,open),{initialProps:{ready:false}});
 expect(native.consume).not.toHaveBeenCalled();hook.rerender({ready:true});
 await waitFor(()=>expect(open).toHaveBeenCalledTimes(1));hook.unmount();
});
it('handles warm launches and ignores completion after the session locks',async()=>{
 const open=vi.fn();const hook=renderHook(({ready})=>useQuickAddLaunch(ready,open),{initialProps:{ready:true}});
 await waitFor(()=>expect(native.consume).toHaveBeenCalledTimes(1));
 native.consume.mockResolvedValueOnce({addTransaction:true});
 act(()=>window.dispatchEvent(new Event('kairosQuickAdd')));
 await waitFor(()=>expect(open).toHaveBeenCalledTimes(1));
 let resolve:((value:{addTransaction:boolean})=>void)|undefined;
 native.consume.mockImplementationOnce(()=>new Promise<{addTransaction:boolean}>(done=>{resolve=done;}));
 act(()=>window.dispatchEvent(new Event('kairosQuickAdd')));
 await waitFor(()=>expect(resolve).toBeDefined());hook.rerender({ready:false});
 await act(async()=>{resolve?.({addTransaction:true});});expect(open).toHaveBeenCalledTimes(1);hook.unmount();
});
it('does not invoke the Android bridge on web',()=>{
 native.enabled=false;const hook=renderHook(()=>useQuickAddLaunch(true,vi.fn()));
 expect(native.consume).not.toHaveBeenCalled();hook.unmount();
});

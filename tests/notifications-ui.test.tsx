// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {NotificationSettings} from '../src/ui/screens/Notifications';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined,request:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true},registerPlugin:()=>({request:state.request})}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);state.request.mockReset();});
afterEach(cleanup);
it.each(['dark','light'])('keeps opt-ins independent and leaves denied preference off in %s',async theme=>{
 document.documentElement.dataset.theme=theme;const q=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={q}><NotificationSettings/></QueryClientProvider>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Upcoming bills'}) as HTMLButtonElement).disabled).toBe(false));
 expect(state.request).not.toHaveBeenCalled();
 state.request.mockResolvedValue({granted:false});fireEvent.click(screen.getByRole('button',{name:'Upcoming bills'}));
 await screen.findByText('Notifications are off in Android settings. Your preference was not changed.');
 expect((await state.repo!.notifications.preferences()).bill).toBe(false);
 state.request.mockResolvedValue({granted:true});fireEvent.click(screen.getByRole('button',{name:'Upcoming bills'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Upcoming bills'}).getAttribute('aria-pressed')).toBe('true'));
 expect(await state.repo!.notifications.preferences()).toEqual({bill:true,unusual:false,price:false,digest:false});
 fireEvent.click(screen.getByRole('button',{name:'Upcoming bills'}));await waitFor(async()=>expect((await state.repo!.notifications.preferences()).bill).toBe(false));
 expect(state.request).toHaveBeenCalledTimes(2);
});

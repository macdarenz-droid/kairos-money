// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TransactionAttachments} from '../src/ui/screens/TransactionAttachments';
import {repository,type Repository} from '../src/core/db/repository';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined,ocr:vi.fn(),signal:undefined as AbortSignal|undefined}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(repo:Repository)=>Promise<T>)=>fn(state.repo!)})}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true},registerPlugin:()=>({})}));
vi.mock('../src/ingest/sources',()=>({FileSource:class{receiptText(){return state.ocr();}}}));
vi.mock('../src/ui/screens/ReceiptCamera',()=>({ReceiptCamera:({onUse}:{onUse:(data:string,signal:AbortSignal)=>Promise<void>})=><button onClick={()=>{const controller=new AbortController();state.signal=controller.signal;void onUse('U3ludGhldGlj',controller.signal);}}>Confirm synthetic camera photo</button>}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);state.ocr.mockReset().mockResolvedValue('Synthetic receipt text');await state.repo.addAccount({id:'a',name:'Cash',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});await state.repo.manual.save({id:'m',kind:'expense',accountId:'a',destinationId:null,date:'2026-03-01',minor:'1000',description:'Purchase',category:null,notes:''});});
afterEach(cleanup);
for(const theme of ['dark','light'])it(`saves a camera receipt through encrypted repository without another transaction in ${theme}`,async()=>{
 document.documentElement.dataset.theme=theme;const before=await state.repo!.exportAll();render(<QueryClientProvider client={new QueryClient()}><TransactionAttachments target="manual:m"/></QueryClientProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Take receipt photo'}));fireEvent.click(screen.getByRole('button',{name:'Confirm synthetic camera photo'}));
 await waitFor(async()=>expect((await state.repo!.attachments.read('manual:m')).receipts).toHaveLength(1));await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('saved in Notes and receipts for this transaction'));const raw=screen.getByText('Synthetic receipt text').closest('details')!;expect(raw.parentElement?.closest('details')?.open).toBe(true);expect(raw.querySelector('summary')?.textContent).toBe('Read the text on this photo');const after=await state.repo!.exportAll();expect(after.tables.transactions).toEqual(before.tables.transactions);expect((await state.repo!.manual.today('2026-03-01'))[0]?.spending).toBe('1000');expect((await state.repo!.attachments.read('manual:m')).receipts[0]?.text).toBe('Synthetic receipt text');
 const fresh=memoryDriver();await migrate(fresh.driver);const restored=repository(fresh.driver);await restored.restoreBackup(after);expect(await restored.attachments.read('manual:m')).toEqual(await state.repo!.attachments.read('manual:m'));
});

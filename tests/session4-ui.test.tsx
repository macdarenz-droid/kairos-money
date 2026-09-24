// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import App from '../src/ui/App';
import {RecoveryCode} from '../src/ui/design/RecoveryCode';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!),lock:async()=>undefined})}));
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);state.repo=repository(driver);window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}});HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
afterEach(cleanup);
function mount(child:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{child}</QueryClientProvider>);}
it('retains Add transaction intent while accounts are loading instead of opening account setup',async()=>{
 await state.repo!.addAccount({id:'a',name:'Synthetic cash',institution:'',type:'cash',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const original=state.repo!.accounts;let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});vi.spyOn(state.repo!,'accounts').mockImplementation(async()=>{await pending;return original();});
 mount(<App/>);fireEvent.click(screen.getByRole('button',{name:'Today'}));fireEvent.click(screen.getByRole('button',{name:'Add transaction'}));expect(screen.queryByLabelText('Account name')).toBeNull();release();
 expect(await screen.findByRole('button',{name:'Save transaction'})).toBeTruthy();expect(screen.queryByLabelText('Account name')).toBeNull();
});
/**
 * "not in ledger" — the accounts list printed each balance in the account's own currency, so the one
 * screen that says what you hold disagreed with the tiles that say the same thing. A balance is what is
 * held NOW, so it converts at today's rate; a purchase would convert at its own day's.
 */
it('shows account balances on Ledger in the display currency',async()=>{
 await state.repo!.addAccount({id:'a',name:'Synthetic everyday',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:11600n});
 await state.repo!.setDisplayCurrency('PHP');
 await state.repo!.saveRates([{asOf:'2026-01-01',base:'AUD',quote:'PHP',rateE8:4200000000n,source:'test'}]);
 mount(<App/>);
 fireEvent.click(screen.getByRole('button',{name:'Ledger'}));
 // A$116.00 at 42 is ₱4,872.00, and the row still says which currency the account itself is in.
 await waitFor(()=>expect(document.querySelector('main')!.textContent).toContain('4,872.00'));
 expect(document.querySelector('main')!.textContent).not.toContain('$116.00');
});

it('shows all ten recovery groups while preserving the complete selectable code',()=>{const code='2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789';const view=render(<RecoveryCode value={code}/>);expect((screen.getByLabelText('Recovery code') as HTMLInputElement).value).toBe(code);expect(view.container.querySelectorAll('.recovery-groups span')).toHaveLength(10);});

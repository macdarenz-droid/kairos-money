// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {SpendingPatterns} from '../src/ui/screens/SpendingPatterns';
import type {Driver} from '../src/core/db/driver';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));let driver:Driver;
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{({driver}=memoryDriver());await migrate(driver);state.repo=repository(driver);HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const id of ['a','b'])await state.repo.addAccount({id,name:'Account '+id,institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 for(const [id,account,date,amount] of [['one','a','2026-01-05',-1200],['two','b','2026-07-05',-2300]] as const){await driver.execute("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,type,is_recurring,fingerprint,confidence,user_verified,notes,status) VALUES(?,?,?,?,'AUD','Debit Card Purchase Synthetic Cafe','debit',0,?,10000,1,'','settled')",[id,account,date,amount,id]);}
});
afterEach(cleanup);
it.each(['dark','light'])('shows spending without categories/payslips/complete coverage and drills into evidence in %s',async theme=>{
 document.documentElement.dataset.theme=theme;render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SpendingPatterns/></QueryClientProvider>);
 await screen.findByText(/2 settled transactions/);expect(screen.getByRole('combobox',{name:'Spending period'})).toHaveProperty('value','all');
 fireEvent.click(screen.getByRole('button',{name:/35.00 AUD, recorded purchases and fees/}));expect(await screen.findByRole('dialog')).toBeTruthy();expect(within(screen.getByRole('dialog')).getAllByText('Debit Card Purchase Synthetic Cafe')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Close Recorded spending'}));
 fireEvent.change(screen.getByLabelText('Spending period'),{target:{value:'2026-07'}});await screen.findByText(/1 settled transactions/);expect(screen.getByRole('button',{name:/23.00 AUD, recorded purchases and fees/})).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Spending account'),{target:{value:'a'}});await waitFor(()=>expect(screen.getByLabelText('Spending period')).toHaveProperty('value','all'));expect(screen.getByRole('button',{name:/12.00 AUD, recorded purchases and fees/})).toBeTruthy();
});

// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {Repository} from '../src/core/db/repository';
import {Refunds} from '../src/ui/screens/Refunds';
import {refundFixture} from './refund-fixture';
const state=vi.hoisted(()=>({repo:undefined as Repository|undefined}));let purchase:string,credit:string;
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:<T,>(fn:(r:Repository)=>Promise<T>)=>fn(state.repo!)})}));
beforeEach(async()=>{const fixture=await refundFixture();state.repo=fixture.repo;purchase=fixture.purchase;credit=fixture.thirty;});afterEach(cleanup);
it.each(['dark','light'])('confirms a refund and removes its link without deleting money in %s',async theme=>{
 document.documentElement.dataset.theme=theme;const q=new QueryClient({defaultOptions:{queries:{retry:false}}});const view=render(<QueryClientProvider client={q}><Refunds id={credit} credit/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Link this credit as a refund'}));expect((screen.getByRole('button',{name:'Confirm refund link'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.change(screen.getByLabelText('Original purchase'),{target:{value:purchase}});fireEvent.click(screen.getByRole('button',{name:'Confirm refund link'}));await screen.findByRole('button',{name:'Review refund link'});expect((await state.repo!.refunds.read(credit)).link?.purchaseId).toBe(purchase);
 view.unmount();const purchaseView=render(<QueryClientProvider client={q}><Refunds id={purchase} credit={false}/></QueryClientProvider>);await screen.findByText('Purchase amount after linked refunds');expect(screen.getByLabelText(/purchase amount after linked refunds/).textContent).toContain('70.00');purchaseView.unmount();
 render(<QueryClientProvider client={q}><Refunds id={credit} credit/></QueryClientProvider>);fireEvent.click(await screen.findByRole('button',{name:'Remove refund link'}));expect((await state.repo!.refunds.read(credit)).saved).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Confirm remove refund link'}));await screen.findByRole('button',{name:'Link this credit as a refund'});expect((await state.repo!.imports.ledger())).toHaveLength(4);
});

// Ranking itself is unit-tested against synthetic candidates in proposals-match.test.ts; what needs the real
// screen is that a ranked match renders with its reason, that selecting one is a single tap, and that the
// tap fills the choice without committing anything.
it('offers a ranked match that fills the choice in one tap and still requires confirmation',async()=>{
 const q=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={q}><Refunds id={credit} credit/></QueryClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Link this credit as a refund'}));
 const select=screen.getByRole('button',{name:/^Select Synthetic purchase, 2026-01-02, Synthetic, /});
 expect(select.getAttribute('aria-label')).toContain('Most recent eligible purchase.');
 expect(screen.getByText('Most recent eligible purchase.')).toBeTruthy();

 expect((screen.getByLabelText('Original purchase') as HTMLSelectElement).value).toBe('');
 expect((screen.getByRole('button',{name:'Confirm refund link'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(select);

 // One tap filled the choice. It did not save: confirming is still a separate, explicit step.
 expect((screen.getByLabelText('Original purchase') as HTMLSelectElement).value).toBe(purchase);
 expect((screen.getByRole('button',{name:'Confirm refund link'}) as HTMLButtonElement).disabled).toBe(false);
 expect((await state.repo!.refunds.read(credit)).saved).toBe(false);

 // The warning that a matching amount is not proof of a refund survives the shortcut.
 expect(screen.getByText(/not proof of a refund/)).toBeTruthy();
});

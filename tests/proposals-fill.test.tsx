// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TransactionSplits} from '../src/ui/screens/TransactionSplits';
import {currency} from '../src/core/money';

HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const state=vi.hoisted(()=>({save:vi.fn().mockResolvedValue(undefined),split:null as unknown}));
vi.mock('../src/ui/session',()=>({useSession:()=>({state:'ready',run:(fn:(repo:Record<string,unknown>)=>Promise<unknown>)=>fn({
 splits:{get:()=>Promise.resolve(state.split),save:state.save,remove:vi.fn()},
})})}));
const wrap=(ui:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);
afterEach(()=>{cleanup();state.save.mockClear();state.split=null;});

const open=async(minor:string)=>{
 wrap(<TransactionSplits id="t1" minor={minor} code={currency('AUD')}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Split this expense'}));
 await waitFor(()=>expect(screen.getByLabelText('Amount 1')).toBeTruthy());
};
const amounts=()=>[...document.querySelectorAll('input[inputmode="decimal"]')].map(i=>(i as HTMLInputElement).value);

it('splits evenly to the cent, giving the indivisible remainder to the earliest parts',async()=>{
 await open('-1000');            // $10.00 across two parts
 fireEvent.click(screen.getByRole('button',{name:'Split evenly'}));
 await waitFor(()=>expect(amounts()).toEqual(['5.00','5.00']));
 // A total that does not divide evenly still sums exactly.
 cleanup();
 await open('-1001');            // $10.01 across two parts
 fireEvent.click(screen.getByRole('button',{name:'Split evenly'}));
 await waitFor(()=>expect(amounts()).toEqual(['5.01','5.00']));
});

it('fills the remainder into the first empty part without changing the total',async()=>{
 await open('-1000');
 fireEvent.change(screen.getByLabelText('Amount 1'),{target:{value:'3.00'}});
 fireEvent.click(screen.getByRole('button',{name:'Fill remainder'}));
 await waitFor(()=>expect(amounts()).toEqual(['3.00','7.00']));
});

it('leaves the save confirmation in place: filling commits nothing',async()=>{
 await open('-1000');
 fireEvent.click(screen.getByRole('button',{name:'Split evenly'}));
 await waitFor(()=>expect(amounts()).toEqual(['5.00','5.00']));
 expect(state.save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Save category split'}));
 await waitFor(()=>expect(state.save).toHaveBeenCalledOnce());
 expect(state.save.mock.calls[0]![1]).toEqual([{category:'Groceries',minor:'500'},{category:'Shopping',minor:'500'}]);
});

// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {WindowedList} from '../src/ui/design/WindowedList';
afterEach(cleanup);

it('reports its visible range once per distinct window, not once per render',()=>{
 const items=Array.from({length:5000},(_,i)=>({id:'row-'+i}));
 const onRange=vi.fn();
 const view=render(<WindowedList items={items} id={r=>r.id} label="Transactions" onRange={onRange} render={r=><span>{r.id}</span>}/>);
 const afterMount=onRange.mock.calls.length;
 expect(afterMount).toBeGreaterThan(0);
 // Re-rendering with an unchanged window must not ask for it again: a paged caller would refetch
 // on every frame of a scroll, which is the failure mode this guard exists to prevent.
 for(let i=0;i<10;i++)view.rerender(<WindowedList items={items} id={r=>r.id} label="Transactions" onRange={onRange} render={r=><span>{r.id}</span>}/>);
 expect(onRange.mock.calls.length).toBe(afterMount);
 expect(onRange).toHaveBeenLastCalledWith(0,expect.any(Number));
});

// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {render,fireEvent} from '@testing-library/react';
import {WindowedList} from '../src/ui/design/WindowedList';
it('bounds rendered rows for 20,000 records and reaches the last record',()=>{
 const items=Array.from({length:20000},(_,i)=>({id:String(i)}));const started=performance.now();const view=render(<WindowedList items={items} id={r=>r.id} label="Synthetic ledger" render={r=><button>{r.id}</button>}/>);
 expect(view.container.querySelectorAll('[role=listitem]').length).toBeLessThan(20);
 fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:19999*80}});expect(view.getByText('19999')).toBeTruthy();expect(view.container.querySelectorAll('[role=listitem]').length).toBeLessThan(20);
 console.info(JSON.stringify({benchmark:'synthetic-20000-windowed-DOM',elapsed_ms:Math.round(performance.now()-started),platform:'jsdom; not Android frame-time proof'}));view.unmount();
});

// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,fireEvent,render} from '@testing-library/react';
import {WindowedList} from '../src/ui/design/WindowedList';

// The CSS height of .windowed-list, which is what a real browser clamps scrollTop against.
const viewportHeight=560;

/**
 * jsdom does no layout, so a row measures 0 and the list never learns a height. Reporting a height here is
 * what lets these tests exercise the estimate at all — and the estimate is the whole reason the device
 * gate could reach row 19,999 at 200% text zoom and not row 20,000.
 */
function rowsMeasure(height:number){
 const real=Element.prototype.getBoundingClientRect;
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(this:Element){
  if(this.getAttribute('role')==='listitem')return {height,width:300,top:0,left:0,right:300,bottom:height,x:0,y:0,toJSON(){}} as DOMRect;
  return real.call(this);
 });
}
afterEach(()=>vi.restoreAllMocks());

const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
/** The spacer's height is what the list reports as its scrollable content, so it is the browser's scrollHeight. */
const reportedHeight=(container:HTMLElement)=>parseFloat((container.querySelector('.windowed-list > div') as HTMLElement).style.height);
const positions=(container:HTMLElement)=>[...container.querySelectorAll('[role=listitem]')].map(row=>Number(row.getAttribute('aria-posinset')));

const list=()=>{
 const items=Array.from({length:20000},(_,index)=>({id:String(index)}));
 return render(<WindowedList items={items} id={row=>row.id} label="Synthetic ledger" render={row=><button>{row.id}</button>}/>);
};

it('reports a height that reflects how tall its rows actually are',async()=>{
 rowsMeasure(140);
 const view=list();
 await settle();
 // 20,000 rows at 140px. Assuming 80px reported 1,600,000 for the same list — short by 43%, which made
 // the scrollbar and every jump wrong, not just the last row.
 expect(reportedHeight(view.container)).toBe(20000*140);
 view.unmount();
});

it('mounts the final row after a single jump to the bottom, as a scroll to the end does',async()=>{
 rowsMeasure(140);
 const view=list();
 await settle();
 // Exactly what LedgerPerformanceInstrumentedTest does on the device: set scrollTop to the scrollable
 // maximum once, then wait. One jump has to be enough; before the estimate was measured this reached
 // 19,999 and then stalled, because measuring the tail grew the total out from under the viewport.
 fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:reportedHeight(view.container)-viewportHeight}});
 await settle();
 expect(view.container.querySelector('[aria-posinset="20000"]')).toBeTruthy();
 view.unmount();
});

it('stays at the bottom once it is there, instead of drifting as more rows are measured',async()=>{
 rowsMeasure(140);
 const view=list();
 await settle();
 const target=reportedHeight(view.container)-viewportHeight;
 for(let round=0;round<4;round++){
  fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:target}});
  await settle();
  // The height must not move, or the same scrollTop stops being the bottom next round.
  expect(reportedHeight(view.container)).toBe(20000*140);
  expect(Math.max(...positions(view.container))).toBe(20000);
 }
 view.unmount();
});

it('keeps the mounted window bounded at every row height, including shorter than the default',async()=>{
 for(const height of [24,80,140,220]){
  rowsMeasure(height);
  const view=list();
  await settle();
  expect(positions(view.container).length).toBeLessThanOrEqual(40);
  fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:reportedHeight(view.container)/2}});
  await settle();
  expect(positions(view.container).length).toBeLessThanOrEqual(40);
  fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:reportedHeight(view.container)-viewportHeight}});
  await settle();
  expect(positions(view.container).length).toBeLessThanOrEqual(40);
  expect(Math.max(...positions(view.container))).toBe(20000);
  view.unmount();
  vi.restoreAllMocks();
 }
});

it('falls back to the default estimate until something has been measured',async()=>{
 // No mock: jsdom reports 0, the row is never measured, and the list must still lay out 20,000 rows.
 const view=list();
 await settle();
 expect(reportedHeight(view.container)).toBe(20000*80);
 expect(positions(view.container).length).toBeLessThanOrEqual(40);
 view.unmount();
});

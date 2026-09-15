// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {WindowedList} from '../src/ui/design/WindowedList';

// The CSS height of .windowed-list, which is what a real browser clamps scrollTop against.
const viewportHeight=560;

/**
 * jsdom does no layout, so a row measures 0 and the list never learns a height. Reporting a height here is
 * what lets these tests exercise the estimate at all — and the estimate is the whole reason the device
 * gate could reach row 19,999 at 200% text zoom and not row 20,000.
 */
// Captured once, before any spy exists, so every mock below delegates to the real implementation rather
// than to whatever spy a previous test left in place. Chaining spies made one test's result depend on
// which tests ran before it.
const realRect=Element.prototype.getBoundingClientRect;
function measuresAs(height:(row:Element)=>number){
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(this:Element){
  if(this.getAttribute('role')!=='listitem')return realRect.call(this);
  const h=height(this);
  return {height:h,width:300,top:0,left:0,right:300,bottom:h,x:0,y:0,toJSON(){}} as DOMRect;
 });
}
const rowsMeasure=(height:number)=>measuresAs(()=>height);
// A test that fails before its unmount would otherwise leave its list in the document, and the next test
// would fail looking up a role that now matches twice — reporting a second failure that says nothing
// about the code under test.
afterEach(()=>{cleanup();vi.restoreAllMocks();});

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

/**
 * The case the device gate actually performs, and the one a warm cache defeats.
 *
 * LedgerPerformanceInstrumentedTest scrolls the whole list at 100% text zoom before it ever switches to
 * 200%, so by then several hundred rows have been measured and cached at the smaller size. Only the
 * mounted handful re-measures after the switch, so without invalidation the map stays dominated by the old
 * measurements: the list reported 1,780,024 for a 3,000,000 list and the final row was never reached.
 */
it('re-measures the whole list when the text size changes under it',async()=>{
 let height=80;
 measuresAs(()=>height);
 const view=list();
 await settle();

 // Text zoom 100: walk the list the way the device test does, filling the height cache.
 for(let y=0;y<22578;y+=188)fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:y}});
 await settle();
 fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:reportedHeight(view.container)-viewportHeight}});
 await settle();
 expect(reportedHeight(view.container)).toBe(20000*80);
 expect(Math.max(...positions(view.container))).toBe(20000);

 // Text zoom 200: every row is now taller, but only the mounted ones can report it.
 height=150;
 fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:0}});
 await settle();
 expect(reportedHeight(view.container)).toBe(20000*150);
 fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:reportedHeight(view.container)-viewportHeight}});
 await settle();
 expect(view.container.querySelector('[aria-posinset="20000"]')).toBeTruthy();
 expect(positions(view.container).length).toBeLessThanOrEqual(40);
 view.unmount();
});

it('does not discard the cache because rows differ from each other',async()=>{
 // Each row is compared only with its own previous measurement, so a list of genuinely uneven rows keeps
 // every height it has measured. Discarding on row-to-row difference would throw the cache away on every
 // frame and leave the list permanently estimating.
 measuresAs(row=>60+Number(row.getAttribute('aria-posinset'))%120);
 const view=list();
 await settle();
 const before=reportedHeight(view.container);
 for(let y=0;y<4000;y+=200)fireEvent.scroll(view.getByRole('list'),{target:{scrollTop:y}});
 await settle();
 // More rows measured means a better estimate, so the reported height moves — but it must not collapse
 // back toward a single row's height, which is what a cache cleared every pass would do.
 const after=reportedHeight(view.container);
 expect(after).toBeGreaterThan(20000*60);
 expect(after).toBeLessThan(20000*180);
 expect(Math.abs(after-before)).toBeLessThan(before);
 view.unmount();
});

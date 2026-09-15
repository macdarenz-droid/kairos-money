// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FlowBar} from '../src/ui/design/FlowBar';
import {MonthBalance} from '../src/ui/design/MonthBalance';
import {DayStrip} from '../src/ui/design/DayStrip';
import {currency} from '../src/core/money';

const AUD=currency('AUD');
afterEach(cleanup);

const widths=()=>[...document.querySelectorAll<HTMLElement>('.flow-fill')].map(n=>n.style.width);

it('draws both flows on one shared scale, so the two lengths can be compared',()=>{
 render(<FlowBar flow={{inMinor:'500000',outMinor:'375000'}} code={AUD} label="2026-08"/>);
 // The larger figure fills the track; the smaller is its exact proportion. Two scales would make the
 // shorter bar look as long as the longer one, which is the whole failure this card exists to avoid.
 expect(widths()).toEqual(['100%','75%']);
 const gap=document.querySelector<HTMLElement>('.flow-gap')!;
 expect(gap.style.insetInlineStart).toBe('75%');   // begins where the shorter bar ends
 expect(gap.style.width).toBe('25%');              // and spans exactly the difference
 expect(screen.getAllByText('$1,250.00').length).toBeGreaterThan(0);
 expect(screen.getByText(/stayed with you/)).toBeTruthy();
});

it('says money ran out rather than drawing a negative length',()=>{
 render(<FlowBar flow={{inMinor:'300000',outMinor:'450000'}} code={AUD} label="2026-08"/>);
 expect(widths()).toEqual(['66.6666%','100%']);
 expect(screen.getByText(/more went out than came in/)).toBeTruthy();
 expect(screen.getByText('Short by')).toBeTruthy();
 expect(document.querySelector('.flow-gap-short')).toBeTruthy();
 for(const width of widths())expect(Number.parseFloat(width)).toBeGreaterThanOrEqual(0);
});

it('draws both directions against one shared denominator, so a heavy month cannot look like a light one',()=>{
 render(<MonthBalance months={[
  {month:'2026-06',inMinor:'500000',outMinor:'200000'},   // $3,000.00 stayed — the tallest column
  {month:'2026-07',inMinor:'400000',outMinor:'550000'},   // $1,500.00 more went out
  {month:'2026-08',inMinor:'400000',outMinor:'250000'},   // $1,500.00 stayed
 ]} code={AUD}/>);
 const bars=[...document.querySelectorAll<HTMLElement>('.balance-bar')];
 // Span is $3,000.00 up plus $1,500.00 down, so the zero line sits two thirds down and every column is a
 // share of that one span. Giving each direction its own scale would draw the $1,500.00 overspend as tall
 // as the $3,000.00 surplus, which is the lie this chart exists to avoid.
 expect(document.querySelector<HTMLElement>('.balance-zero')!.style.top).toBe('66.6666%');
 expect(bars.map(b=>b.style.height)).toEqual(['66.6666%','33.3333%','33.3333%']);
 expect(bars[2]!.style.height).toBe(bars[1]!.style.height);
 expect(bars[0]!.classList.contains('balance-bar-kept')).toBe(true);
 expect(bars[1]!.classList.contains('balance-bar-short')).toBe(true);
});

it('grows surpluses up from the zero line and shortfalls down from it',()=>{
 render(<MonthBalance months={[
  {month:'2026-06',inMinor:'500000',outMinor:'200000'},
  {month:'2026-07',inMinor:'400000',outMinor:'550000'},
 ]} code={AUD}/>);
 const [kept,short]=[...document.querySelectorAll<HTMLElement>('.balance-bar')];
 // Measured from opposite edges, so they are complements: both ends sit on the same zero line.
 expect(Number.parseFloat(kept!.style.bottom)+Number.parseFloat(short!.style.top)).toBeCloseTo(100,3);
 expect(kept!.style.top).toBe('');
 expect(short!.style.bottom).toBe('');
});

it('never leaves identity to colour alone',()=>{
 render(<MonthBalance months={[
  {month:'2026-06',inMinor:'500000',outMinor:'200000'},
  {month:'2026-07',inMinor:'400000',outMinor:'300000'},
 ]} code={AUD}/>);
 // A legend for both directions, a spoken label per column, and the same figures reachable as a table.
 expect(screen.getAllByText('Money stayed').length).toBeGreaterThan(0);
 expect(screen.getAllByText('More went out').length).toBeGreaterThan(0);
 expect(screen.getByText('Read these months as a table')).toBeTruthy();
 expect(screen.getAllByRole('row').length).toBe(3);
});

it('reads out the month a person picks',()=>{
 render(<MonthBalance months={[
  {month:'2026-06',inMinor:'500000',outMinor:'200000'},
  {month:'2026-07',inMinor:'400000',outMinor:'550000'},
 ]} code={AUD}/>);
 // Latest month first, because that is the one being asked about.
 expect(screen.getByText('July 2026')).toBeTruthy();
 expect(screen.getByText(/\$1,500\.00 more went out than came in/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'June 2026: $5,000.00 in, $2,000.00 out, $3,000.00 stayed'}));
 expect(screen.getByText('June 2026')).toBeTruthy();
 expect(screen.getByText(/\$3,000\.00 stayed/)).toBeTruthy();
});

it('draws a single month rather than refusing to draw anything',()=>{
 render(<MonthBalance months={[{month:'2026-06',inMinor:'500000',outMinor:'200000'}]} code={AUD}/>);
 expect(document.querySelectorAll('.balance-bar')).toHaveLength(1);
 expect(screen.getByText('June 2026')).toBeTruthy();
});

it('puts today at the end of a fortnight, scaled to the heaviest day in view',()=>{
 const days=[
  {date:'2026-08-20',minor:'-4000'},   // the peak in view
  {date:'2026-08-25',minor:'-1000'},
  {date:'2026-08-26',minor:'-2000'},
  {date:'2026-08-10',minor:'-9900'},   // outside the window: must not set the scale
 ];
 render(<DayStrip days={days} code={AUD} today="2026-08-26"/>);
 const bars=[...document.querySelectorAll<HTMLElement>('.strip-bar')];
 expect(bars).toHaveLength(14);
 // A day outside the fortnight setting the scale would flatten every bar in view against a figure the
 // reader cannot see.
 expect(bars[7]!.style.height).toBe('100%');   // 2026-08-20, the peak in view
 expect(bars[12]!.style.height).toBe('25%');   // 2026-08-25
 expect(bars[13]!.style.height).toBe('50%');   // today
 expect(document.querySelectorAll('[data-today]')).toHaveLength(1);
 expect(screen.getByText('spent today')).toBeTruthy();
 expect(screen.getAllByText('$20.00').length).toBeGreaterThan(0);
});

it('draws the days as marks, never as fourteen tap targets too small to hit',()=>{
 // Fourteen 44px targets need 616px; the gate device gives the app 371px, so per-day buttons came out
 // 24px wide and failed the touch-target check on a real phone. The figures stay reachable in the table.
 render(<DayStrip days={[{date:'2026-08-26',minor:'-2000'}]} code={AUD} today="2026-08-26"/>);
 expect(document.querySelectorAll('.strip-plot button')).toHaveLength(0);
 expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/last 14 days/);
 expect(screen.getByText('Read these days as a list')).toBeTruthy();
});

it('shows a day with nothing spent as nothing, not as a gap in the record',()=>{
 render(<DayStrip days={[{date:'2026-08-26',minor:'-2000'}]} code={AUD} today="2026-08-26"/>);
 // Every day of the fortnight is listed, including the ones with nothing on them.
 expect(screen.getAllByRole('row').length).toBe(15);
 expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
});

it('ignores money arriving when drawing what was spent',()=>{
 render(<DayStrip days={[{date:'2026-08-26',minor:'-2000'},{date:'2026-08-26',minor:'500000'}]} code={AUD} today="2026-08-26"/>);
 expect(screen.getAllByText('$20.00').length).toBeGreaterThan(0);
 expect(document.body.textContent).not.toContain('$5,000.00');
});

it('shows six months to a page, so every column stays big enough to press',()=>{
 // Nine columns across the gate device's 371px come out 39px wide and fail the 44px touch-target check.
 const months=Array.from({length:9},(_,i)=>({month:`2026-0${i+1}`,inMinor:'600000',outMinor:'400000'}));
 render(<MonthBalance months={months} code={AUD}/>);
 expect(document.querySelectorAll('.balance-column')).toHaveLength(6);
 // The page opens on the most recent months, which is what someone is asking about.
 expect(screen.getByText('September 2026')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Earlier months'}));
 // The oldest page carries the remainder, so it is short rather than padded with months that do not exist.
 expect(document.querySelectorAll('.balance-column')).toHaveLength(3);
 expect(screen.getByText('March 2026')).toBeTruthy();
 // Every month is still listed, whichever page is showing.
 expect(screen.getAllByRole('row').length).toBe(10);
});

it('keeps one scale across every month, so turning the page never rescales the picture',()=>{
 const months=[
  {month:'2026-01',inMinor:'600000',outMinor:'200000'},   // the biggest surplus, on the earlier page
  ...Array.from({length:6},(_,i)=>({month:`2026-0${i+2}`,inMinor:'600000',outMinor:'400000'})),
 ];
 render(<MonthBalance months={months} code={AUD}/>);
 const later=[...document.querySelectorAll<HTMLElement>('.balance-bar')].map(b=>b.style.height);
 fireEvent.click(screen.getByRole('button',{name:'Earlier months'}));
 const earlier=[...document.querySelectorAll<HTMLElement>('.balance-bar')].map(b=>b.style.height);
 // January is $4,000.00 kept against $2,000.00 in the other months: it must draw twice as tall, not the
 // same height it would have if each page were scaled to itself.
 expect(earlier[0]).toBe('100%');
 expect(later[0]).toBe('50%');
});

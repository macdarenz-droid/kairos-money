// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FlowBar} from '../src/ui/design/FlowBar';
import {DayStrip} from '../src/ui/design/DayStrip';
import {CategorySplit} from '../src/ui/design/CategorySplit';
import {currency} from '../src/core/money';

const AUD=currency('AUD');
afterEach(cleanup);

const slice=(name:string,minor:string)=>({name,minor,ids:[name]});
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
 expect(screen.getByText(/^Left ·/)).toBeTruthy();
});

it('says money ran out rather than drawing a negative length',()=>{
 render(<FlowBar flow={{inMinor:'300000',outMinor:'450000'}} code={AUD} label="2026-08"/>);
 expect(widths()).toEqual(['66.6666%','100%']);
 expect(screen.getByText(/^Overspent ·/)).toBeTruthy();
 expect(screen.getByText('Over')).toBeTruthy();
 expect(document.querySelector('.flow-gap-short')).toBeTruthy();
 for(const width of widths())expect(Number.parseFloat(width)).toBeGreaterThanOrEqual(0);
});

it('puts today at the end of the week, scaled to the heaviest day in view',()=>{
 const days=[
  {date:'2026-08-22',minor:'-4000'},   // the peak in view
  {date:'2026-08-25',minor:'-1000'},
  {date:'2026-08-26',minor:'-2000'},
  {date:'2026-08-10',minor:'-9900'},   // outside the window: must not set the scale
 ];
 render(<DayStrip days={days} code={AUD} today="2026-08-26"/>);
 const bars=[...document.querySelectorAll<HTMLElement>('.strip-bar')];
 expect(bars).toHaveLength(7);
 // A day outside the week setting the scale would flatten every bar in view against a figure the reader
 // cannot see.
 expect(bars[2]!.style.height).toBe('100%');   // 2026-08-22, the peak in view
 expect(bars[5]!.style.height).toBe('25%');    // 2026-08-25
 expect(bars[6]!.style.height).toBe('50%');    // today
 expect(document.querySelectorAll('[data-today]')).toHaveLength(1);
 expect(screen.getByText('The last seven days')).toBeTruthy();
 // Today's figure is the screen's headline, shown once by the block above this one. The strip is the
 // context around it and must not print it a second time as a hero of its own — but every day, today
 // included, is still in the table underneath.
 expect(document.querySelector('.strip .hero-amount')).toBeNull();
 // The figures are not printed beside the bars, but they are not lost: the plot's spoken description
 // reads every day out, which is what the table under it used to be for.
 expect(screen.getByRole('img').getAttribute('aria-label')).toContain('$20.00');
});

it('draws the days as marks, never as tap targets too small to hit',()=>{
 // Even seven 44px targets need 308px plus gaps where the gate device gives the app 371px, and fourteen
 // needed 616px. Per-day buttons failed the touch-target check on a real phone; the table still has every
 // figure.
 render(<DayStrip days={[{date:'2026-08-26',minor:'-2000'}]} code={AUD} today="2026-08-26"/>);
 expect(document.querySelectorAll('.strip-plot button')).toHaveLength(0);
 expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/last 7 days/);
 expect(screen.queryByText('Read these days as a list')).toBeNull();
});

it('shows a day with nothing spent as nothing, not as a gap in the record',()=>{
 render(<DayStrip days={[{date:'2026-08-26',minor:'-2000'}]} code={AUD} today="2026-08-26"/>);
 // Every day of the week is spoken, including the ones with nothing on them.
 const spoken=screen.getByRole('img').getAttribute('aria-label')??'';
 expect(spoken.match(/\$0\.00/g)?.length).toBe(6);
 expect(document.querySelectorAll('.strip-column')).toHaveLength(7);
});

it('labels every day distinctly, and never trades today\'s name for a dot',()=>{
 render(<DayStrip days={[{date:'2026-08-26',minor:'-2000'}]} code={AUD} today="2026-08-26"/>);
 const ticks=[...document.querySelectorAll('.strip-tick')].map(t=>t.textContent);
 // One initial makes Tuesday and Thursday both "T" and Saturday and Sunday both "S", so four of seven
 // columns cannot be told apart. Two letters are still narrow enough at doubled text.
 expect(ticks).toEqual(['Th','Fr','Sa','Su','Mo','Tu','We']);
 expect(new Set(ticks).size).toBe(7);
 // Today is marked by its colour and the rule under its tick, not by replacing the day with a character
 // too small to see.
 expect(ticks).not.toContain('\u00b7');
 expect(document.querySelector('[data-today] .strip-tick')?.textContent).toBe('We');
});

it('ignores money arriving when drawing what was spent',()=>{
 render(<DayStrip days={[{date:'2026-08-26',minor:'-2000'},{date:'2026-08-26',minor:'500000'}]} code={AUD} today="2026-08-26"/>);
 const spoken=screen.getByRole('img').getAttribute('aria-label')??'';
 expect(spoken).toContain('$20.00');
 expect(spoken).not.toContain('$5,000.00');
 expect(document.body.textContent).not.toContain('$5,000.00');
});

it('leads with the gap when most spending has no category, instead of drawing it as a finding',()=>{
 // The screenshot complaint: a treemap of one enormous "Uncategorised" rectangle is a picture of nothing,
 // and drawing it anyway dresses a gap up as an answer.
 render(<CategorySplit code={AUD} slices={[slice('Uncategorised','800000'),slice('Groceries','200000')]}/>);
 expect(screen.getByText(/has no category yet/)).toBeTruthy();
 expect(screen.getByText(/\$8,000\.00 of \$10,000\.00/)).toBeTruthy();
 // What is known is still drawn, and the blank block is not.
 expect(document.querySelectorAll('.split-tile')).toHaveLength(1);
});

it('draws the kinds of spending once there are kinds',()=>{
 render(<CategorySplit code={AUD} slices={[
  slice('Groceries','500000'),slice('Transport','300000'),slice('Eating out','200000')]}/>);
 expect(document.querySelectorAll('.split-tile')).toHaveLength(3);
 expect(screen.getByText(/3 kinds of spending/)).toBeTruthy();
 // Largest first, and the ramp runs darkest to lightest with it.
 const levels=[...document.querySelectorAll('.split-tile')].map(t=>t.getAttribute('class')!.match(/level-(\d)/)![1]);
 expect(Number(levels[0])).toBeGreaterThan(Number(levels[2]));
});

it('never leaves a category unnamed or unreachable',()=>{
 const picked:string[]=[];
 render(<CategorySplit code={AUD} slices={[slice('Groceries','500000'),slice('Uncategorised','100000')]} onCategory={n=>picked.push(n)}/>);
 // Colour alone never carries identity: every category is a row in the table, uncategorised included.
 expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Largest is Groceries/);
 expect(screen.getAllByRole('row')).toHaveLength(3);
 fireEvent.click(screen.getByRole('button',{name:'Uncategorised'}));
 expect(picked).toEqual(['Uncategorised']);
});

it('says there is nothing to draw rather than drawing an empty box',()=>{
 render(<CategorySplit code={AUD} slices={[slice('Uncategorised','100000')]}/>);
 expect(screen.getByText(/nothing to draw/)).toBeTruthy();
 expect(document.querySelector('.split-plot')).toBeNull();
 // The amount is still reported: it is a gap, not an absence.
 expect(screen.getByText('$1,000.00')).toBeTruthy();
});

it('takes the heading its screen gives it',()=>{
 // The You tab names each of its sections and a device check captures them by name. When this chart
 // replaced that screen's own treemap it brought its own title, and "Spending by category" vanished.
 render(<CategorySplit code={AUD} heading="Spending by category" slices={[slice('Groceries','500000')]}/>);
 expect(screen.getByRole('heading',{name:'Spending by category'})).toBeTruthy();
});


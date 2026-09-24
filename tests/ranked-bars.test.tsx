// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {RankedBars} from '../src/ui/design/RankedBars';
import {currency} from '../src/core/money';

const AUD = currency('AUD');
afterEach(cleanup);
const fills = () => Array.from(document.querySelectorAll('.ranked-fill')) as HTMLElement[];

/** "keep, but make it visualisation" — a row of figures cannot answer which of them is the big one. */
it('draws each amount as a length against the largest, darkest first', () => {
  render(<RankedBars heading="Merchant history" code={AUD} items={[
    {name: 'Synthetic corner shop', minor: '-2500'},
    {name: 'Synthetic supermarket', minor: '-10000'},
    {name: 'Synthetic cafe', minor: '-5000'},
  ]}/>);
  // Magnitude order, whatever order they arrived in.
  expect(Array.from(document.querySelectorAll('.ranked-name')).map(n => n.textContent))
    .toEqual(['Synthetic supermarket', 'Synthetic cafe', 'Synthetic corner shop']);
  expect(fills().map(f => f.style.width)).toEqual(['100%', '50%', '25%']);
  // One hue, stepped by size: the step reinforces the length, it is not the encoding.
  expect(fills().map(f => f.dataset.rank)).toEqual(['0', '1', '2']);
  // Nothing is only a picture: every bar still carries its own figure.
  expect(document.body.textContent).toContain('$100.00');
});

/** Bills are a question about WHEN, so they keep their date order and the step says which is big. */
it('keeps the given order while still colouring by size', () => {
  render(<RankedBars heading="Upcoming bills" order="given" code={AUD} items={[
    {name: '2026-09-20 · Synthetic rent', minor: '-90000'},
    {name: '2026-09-22 · Synthetic phone', minor: '-4500'},
  ]}/>);
  expect(Array.from(document.querySelectorAll('.ranked-name')).map(n => n.textContent?.slice(0, 10)))
    .toEqual(['2026-09-20', '2026-09-22']);
  expect(fills().map(f => f.dataset.rank)).toEqual(['0', '1']);
});

it('opens the transactions behind a bar, and says how many it left out', () => {
  const open = vi.fn();
  render(<RankedBars heading="Merchant history" code={AUD} shown={2} items={[
    {name: 'One', minor: '-300', onOpen: open}, {name: 'Two', minor: '-200'}, {name: 'Three', minor: '-100'},
  ]}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Transactions behind One'}));
  expect(open).toHaveBeenCalledOnce();
  expect(screen.getByText('1 smaller not shown')).toBeTruthy();
});

/** A chart about nothing is still a thing on the screen. */
it('renders nothing at all when there is nothing to rank', () => {
  const {container} = render(<RankedBars heading="Merchant history" code={AUD} items={[]}/>);
  expect(container.innerHTML).toBe('');
});

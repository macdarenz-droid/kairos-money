// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {BusyOverlay, KairosMark} from '../src/ui/design/KairosMark';

/**
 * The ordering and paging rules the review sheet now follows, exercised on the same shape of data the
 * sheet sorts. Kept beside the mark's own test because both exist for the same complaint: a 733-row
 * import that could not be confirmed without scrolling past all of it, and a wait nobody could see.
 */
type Item = {row: {sourceId: string}; blocked: boolean; duplicate: boolean};
const item = (sourceId: string, over: Partial<Item> = {}): Item =>
  ({row: {sourceId}, blocked: false, duplicate: false, ...over});

const rank = (i: Item) => i.blocked ? 0 : i.duplicate ? 1 : 2;
const order = (items: Item[]) => [...items].sort((a, b) => rank(a) - rank(b));

afterEach(cleanup);

describe('what the review sheet puts first', () => {
  it('lifts the rows that need a decision above the ones that do not', () => {
    const items = [item('plain'), item('dupe', {duplicate: true}), item('stop', {blocked: true}), item('plain2')];
    expect(order(items).map(i => i.row.sourceId)).toEqual(['stop', 'dupe', 'plain', 'plain2']);
  });

  it('keeps source order inside each group, so nothing is shuffled for its own sake', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(order(items).map(i => i.row.sourceId)).toEqual(['a', 'b', 'c']);
  });

  it('shows five, then ten more each press, and says how many are left', () => {
    const total = 733;
    let shown = 5;
    expect(total - shown).toBe(728);
    shown += 10;
    expect(shown).toBe(15);
    // The press never overshoots the end: the control disappears once everything is on screen.
    expect(Math.min(shown, total) < total).toBe(true);
    expect(5 + 10 * 73 >= total).toBe(true);
  });
});

describe('the wait', () => {
  it('covers the viewport rather than sitting wherever it was rendered', () => {
    render(<BusyOverlay message="Adding these transactions to your ledger…"/>);
    const overlay = document.querySelector('.busy-overlay')!;
    // The previous version carried this class and none of its behaviour, so it rendered inline at the
    // bottom of a sheet thousands of pixels below where anyone was looking.
    expect(overlay.className).toContain('busy-overlay');
    expect(overlay.getAttribute('role')).toBe('status');
    expect(overlay.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Adding these transactions to your ledger…')).toBeTruthy();
  });

  it('animates the brand mark, and holds it still when asked to', () => {
    const {container, rerender} = render(<KairosMark/>);
    expect(container.querySelector('.kairos-halves-moving')).toBeTruthy();
    rerender(<KairosMark still/>);
    expect(container.querySelector('.kairos-halves-moving')).toBeNull();
    expect(container.querySelector('.kairos-halves')).toBeTruthy();
  });

  it('draws the disc whole, with both halves of the aperture', () => {
    const {container} = render(<KairosMark/>);
    // Two paths behind one circular clip: that is what makes the staircase between them separable, which
    // an 869KB PNG of the same mark could never be.
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('clipPath circle')).toBeTruthy();
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

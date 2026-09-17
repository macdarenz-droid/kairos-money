// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {DebtBurn} from '../src/ui/design/DebtBurn';
import {plan} from '../src/intelligence/debt';

afterEach(cleanup);

const points = () => screen.getByRole('figure').querySelector('polyline')?.getAttribute('points') ?? '';
const parsed = () => points().split(' ').filter(Boolean).map(pair => pair.split(',').map(Number) as [number, number]);

describe('the burn-down line', () => {
  const debts = [{id: 'card', name: 'Card', balanceMinor: '300000', annualRateBp: '2400', minimumMinor: '10000'}];

  it('starts at the balance held today and lands on the floor', () => {
    const p = plan(debts, '50000', 'avalanche');
    render(<DebtBurn balances={p.balances} startMinor="300000" growing={p.growing} label="Clear in 7 months"/>);
    const pts = parsed();
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.at(-1)).toEqual([1000000, 1000000]);
  });

  /** A line that goes back up would be saying the debt grew, and this plan clears it. */
  it('only ever falls', () => {
    const p = plan(debts, '50000', 'avalanche');
    render(<DebtBurn balances={p.balances} startMinor="300000" growing={p.growing} label="Clear in 7 months"/>);
    const pts = parsed();
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]![0]).toBeGreaterThan(pts[i - 1]![0]);
      expect(pts[i]![1]).toBeGreaterThan(pts[i - 1]![1]);
    }
  });

  /**
   * THE ONE THAT MATTERS. A payment below the interest has no end date at all. Drawing a gently rising
   * curve would dress "never" up as a plan, so there is no line — only the sentence.
   */
  it('draws nothing at all when the payment does not cover the interest', () => {
    render(<DebtBurn balances={[]} startMinor="300000" growing={true} label="This has no end date."/>);
    expect(screen.getByRole('figure').querySelector('polyline')).toBeNull();
    expect(screen.getByText('This has no end date.')).toBeTruthy();
  });

  it('draws nothing when nothing is owed', () => {
    render(<DebtBurn balances={[]} startMinor="0" growing={false} label="Nothing owed"/>);
    expect(screen.getByRole('figure').querySelector('polyline')).toBeNull();
  });

  /** Geometry comes from exact integers, so no coordinate is ever a fraction of a millionth. */
  it('puts every coordinate on the integer grid the viewBox is drawn in', () => {
    const p = plan(debts, '50000', 'avalanche');
    render(<DebtBurn balances={p.balances} startMinor="300000" growing={p.growing} label="Clear in 7 months"/>);
    for (const [x, y] of parsed()) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1000000);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1000000);
    }
  });
});

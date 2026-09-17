// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {MoneyFlow} from '../src/ui/design/MoneyFlow';
import {moneyFlow, type Amount} from '../src/intelligence/visuals/flow';

afterEach(cleanup);

const a = (label: string, minor: string): Amount => ({id: label, label, minor});
const draw = (income: Amount[], spending: Amount[]) => {
  const flow = moneyFlow(income, spending)!;
  render(<MoneyFlow flow={flow} caption="synthetic"/>);
  return flow;
};
const bands = () => Array.from(document.querySelectorAll('rect.flow-band'));
const link = () => document.querySelector('path.flow-link')!.getAttribute('d')!;
/** The y each edge of the joining band ends at on the right, which is where the taper shows. */
const edges = () => link().match(/L 930 ([\d.]+)/)![1]!;

describe('the flow, drawn', () => {
  /**
   * SHADE REPEATS SIZE. Ranked the other way round — which is how this was first written — the biggest
   * block on the chart came out the palest and the eye went to the smallest thing on it.
   */
  it('gives the largest band the strongest shade', () => {
    draw([a('pay', '100000')], [a('big', '60000'), a('small', '10000'), a('tiny', '5000')]);
    const classes = bands().map(b => b.getAttribute('class'));
    expect(classes[0]).toContain('level-5');
    expect(classes[1]).toContain('level-5');
    expect(classes[2]).toContain('level-4');
    expect(classes[3]).toContain('level-3');
  });

  /** A surplus is the height the spending side does not reach, so the band narrows towards it. */
  it('narrows when less went out than came in', () => {
    draw([a('pay', '100000')], [a('rent', '50000')]);
    expect(Number(edges())).toBeLessThan(560);
  });

  it('swells when more went out than came in', () => {
    draw([a('pay', '50000')], [a('rent', '100000')]);
    expect(Number(edges())).toBe(560);
  });

  /** Identity comes from a label. Exactly one per side, on the biggest band, never one per band. */
  it('names the largest band on each side and nothing else', () => {
    draw([a('Salary', '100000'), a('Refund', '9000')],
      [a('Housing', '60000'), a('Groceries', '20000'), a('Transport', '9000')]);
    const labels = Array.from(document.querySelectorAll('text.flow-label')).map(t => t.textContent);
    expect(labels).toEqual(['Salary', 'Housing']);
  });

  it('shortens a label too long to sit in the plot', () => {
    draw([a('A very long income source name indeed', '100000')], [a('Housing', '60000')]);
    const label = document.querySelector('text.flow-label')!.textContent!;
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual(16);
  });

  /**
   * Bands stack end to end and stay inside the plot. The 2px separation between them is a stroke in the
   * stylesheet, which jsdom does not load — that is checked by looking at the render, not asserted here,
   * because an assertion this environment cannot see would prove nothing.
   */
  it('stacks its bands contiguously within the plot', () => {
    draw([a('pay', '100000')], [a('a', '50000'), a('b', '30000'), a('c', '20000')]);
    const right = bands().filter(b => b.getAttribute('x') !== '0');
    let expected = 0;
    for (const band of right) {
      expect(Number(band.getAttribute('y'))).toBeCloseTo(expected, 6);
      expected += Number(band.getAttribute('height'));
    }
    expect(expected).toBeLessThanOrEqual(560);
  });
});

import {describe, expect, it} from 'vitest';
import {MAX_BANDS, OTHER, moneyFlow, type Amount} from '../src/intelligence/visuals/flow';

const a = (id: string, minor: string, label = id): Amount => ({id, label, minor});
const sum = (bands: {minor: string}[]) => bands.reduce((total, b) => total + BigInt(b.minor), 0n).toString();

describe('the money flow', () => {
  it('has nothing to draw when nothing moved', () => {
    expect(moneyFlow([], [])).toBeNull();
    expect(moneyFlow([a('x', '0')], [a('y', '0')])).toBeNull();
  });

  /**
   * THE TAPER MUST WORK IN BOTH DIRECTIONS, and this is the test that would have caught it not doing so.
   *
   * What is left was once drawn as a band on the spending side, which made both stacks exactly the same
   * height whenever anything was left over — so the joining band ran dead flat and the picture said
   * nothing in every month that went well. A surplus is the height the out stack does NOT reach.
   */
  it('leaves the spending side short by whatever was not spent', () => {
    const flow = moneyFlow([a('pay', '100000')], [a('rent', '50000')])!;
    expect(flow.inHeight).toBe('1000000');
    expect(flow.outHeight).toBe('500000');
    expect(flow.leftoverMinor).toBe('50000');
    expect(flow.destinations.map(d => d.label)).toEqual(['rent']);
  });

  /** An overspend has no leftover band — the out stack is simply taller, and that is the picture. */
  it('makes the spending side taller when more went out than came in', () => {
    const flow = moneyFlow([a('pay', '50000')], [a('rent', '100000')])!;
    expect(flow.leftoverMinor).toBe('-50000');
    expect(flow.inHeight).toBe('500000');
    expect(flow.outHeight).toBe('1000000');
    expect(flow.destinations.map(d => d.label)).toEqual(['rent']);
  });

  it('stacks bands end to end with no gap and no overlap', () => {
    const flow = moneyFlow([a('pay', '60000'), a('refund', '40000')], [a('rent', '100000')])!;
    expect(flow.sources.map(s => [s.top, s.height])).toEqual([['0', '600000'], ['600000', '400000']]);
  });

  it('orders largest first, and breaks ties by label so the chart never reshuffles', () => {
    const flow = moneyFlow([a('b', '100'), a('a', '100'), a('big', '900')], [a('x', '1100')])!;
    expect(flow.sources.map(s => s.label)).toEqual(['big', 'a', 'b']);
    expect(flow.sources.map(s => s.rank)).toEqual([0, 1, 2]);
  });

  /** A chart that quietly drops the small amounts is a chart that lies about the total. */
  it('gathers the tail into one named band rather than dropping it', () => {
    const many = Array.from({length: 12}, (_, i) => a(`c${i}`, String(1200 - i * 100)));
    const flow = moneyFlow([a('pay', '100000')], many)!;
    const bands = flow.destinations;
    expect(bands).toHaveLength(MAX_BANDS);
    expect(bands.at(-1)?.label).toBe(OTHER);
    expect(sum(bands)).toBe(sum(many));
  });

  /** Every band is a category, so a month with money left still shows all six of them. */
  it('spends its bands on categories, never on the surplus', () => {
    const many = Array.from({length: 12}, (_, i) => a(`c${i}`, String(1200 - i * 100)));
    const flow = moneyFlow([a('pay', '100000')], many)!;
    expect(flow.destinations).toHaveLength(MAX_BANDS);
    expect(BigInt(flow.leftoverMinor) > 0n).toBe(true);
  });

  it('leaves a short list alone', () => {
    const flow = moneyFlow([a('pay', '100')], [a('x', '60'), a('y', '40')])!;
    expect(flow.destinations.map(d => d.label)).toEqual(['x', 'y']);
  });

  /** Negative entries are not spending going backwards; they are somebody else's problem. */
  it('ignores amounts that are not positive', () => {
    const flow = moneyFlow([a('pay', '100'), a('odd', '-50')], [a('x', '100')])!;
    expect(flow.totalInMinor).toBe('100');
    expect(flow.sources.map(s => s.label)).toEqual(['pay']);
  });

  /** Nothing spent is a real answer: a full in stack and no out stack at all. */
  it('draws a side with income but nothing spent', () => {
    const flow = moneyFlow([a('pay', '100000')], [])!;
    expect(flow.destinations).toEqual([]);
    expect(flow.inHeight).toBe('1000000');
    expect(flow.outHeight).toBe('0');
  });

  /** Every band's height must add up to its side, or the picture is not of this ledger. */
  it('fills exactly its own side and no more', () => {
    const flow = moneyFlow([a('pay', '70000'), a('side', '30000')], [a('rent', '45000'), a('food', '25000')])!;
    const total = (bands: {height: string}[]) => bands.reduce((t, b) => t + BigInt(b.height), 0n).toString();
    expect(total(flow.sources)).toBe(flow.inHeight);
    expect(total(flow.destinations)).toBe(flow.outHeight);
  });
});

// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {format, money} from '../src/core/money';
import {Button} from '../src/ui/design/primitives';
import {BusyOverlay, CountUp, KairosAiMark, KairosAiWorking, Loader} from '../src/ui/design/Motion';

const motion = (reduce: boolean) => { window.matchMedia = vi.fn().mockReturnValue({matches: reduce, addEventListener() {}, removeEventListener() {}}); };
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('busy button', () => {
  it('is disabled, marked busy and keeps its busy words, with a coin before them', () => {
    const {rerender} = render(<Button busy busyLabel="Saving…">Save account</Button>);
    const button = screen.getByRole('button', {name: 'Saving…'});
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('.coin')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<Button busyLabel="Saving…">Save account</Button>);
    const idle = screen.getByRole('button', {name: 'Save account'});
    expect(idle.hasAttribute('disabled') || idle.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('count-up', () => {
  const big = (minor: bigint) => money(minor, 'AUD');
  it('rolls in exact steps and ends on the exact value, reading out only the final one', async () => {
    motion(false);
    const from = 9007199254740991n, to = -9007199254740989n;
    const {container, rerender} = render(<p><CountUp value={big(from)}/></p>);
    expect(container.textContent).toBe(format(big(from)));
    rerender(<p><CountUp value={big(to)}/></p>);
    expect(container.querySelector('.sr-only')?.textContent).toBe(format(big(to)));
    expect(container.querySelector('.count-up')?.getAttribute('aria-hidden')).toBe('true');
    await waitFor(() => expect(container.querySelector('.count-up')).toBeNull());
    expect(container.textContent).toBe(format(big(to)));
  });

  it('shows the new value at once under reduced motion', () => {
    motion(true);
    const {container, rerender} = render(<p><CountUp value={big(5n)}/></p>);
    rerender(<p><CountUp value={big(-123456789n)}/></p>);
    expect(container.textContent).toBe(format(big(-123456789n)));
    expect(container.querySelector('.count-up')).toBeNull();
  });
});

describe('loaders', () => {
  it('keep role status and their labels', () => {
    render(<><Loader label="Reading your money"/><BusyOverlay message="Discarding this import…"/></>);
    expect(screen.getByRole('status', {name: 'Reading your money'}).querySelector('.coin-stack')).toBeTruthy();
    expect(screen.getByText('Discarding this import…').closest('[role="status"]')?.querySelector('.coin-stack')).toBeTruthy();
  });

  it('gives Kairos AI waits one fixed label, a changing line and elapsed seconds after 10 s', () => {
    vi.useFakeTimers();
    const {container} = render(<KairosAiWorking kind="sort"/>);
    expect(screen.getByRole('status', {name: 'Kairos AI is sorting your categories'})).toBeTruthy();
    const line = () => container.querySelector('.meta')!.textContent;
    const first = line();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(line()).not.toBe(first);
    expect(line()).not.toMatch(/ s$/);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(line()).toMatch(/ · 11 s$/);
  });

  it('moves the Kairos AI mark only while thinking, with its own gradient ids', () => {
    const {container} = render(<><KairosAiMark size={20}/><KairosAiMark size={36} thinking/><KairosAiMark size={12} label="Sorted by Kairos AI"/></>);
    const marks = [...container.querySelectorAll('svg.kai-mark')];
    expect(marks.map(m => m.classList.contains('kai-thinking'))).toEqual([false, true, false]);
    const ids = marks.map(m => m.querySelector('linearGradient')!.id);
    expect(new Set(ids).size).toBe(3);
    for (const [i, m] of marks.entries()) expect(m.querySelector('path')!.getAttribute('stroke')).toBe(`url(#${ids[i]})`);
    expect(screen.getByRole('img', {name: 'Sorted by Kairos AI'})).toBe(marks[2]);
    expect(marks[0]!.getAttribute('aria-hidden')).toBe('true');
  });
});

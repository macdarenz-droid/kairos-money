// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {ReorderList} from '../src/ui/design/Reorder';

// jsdom has no PointerEvent; without it a pointer event carries no coordinates.
class TestPointerEvent extends MouseEvent {
  pointerId: number; pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch'; }
}
vi.stubGlobal('PointerEvent', TestPointerEvent);
const items = ['a', 'b', 'c'];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup() {
  const onReorder = vi.fn(), opened = vi.fn();
  render(<ReorderList items={items} keyOf={i => i} label="Accounts" onReorder={onReorder}
    render={i => <button type="button" onClick={() => opened(i)}>Open {i}</button>}/>);
  screen.getAllByRole('listitem').forEach((row, index) => { row.getBoundingClientRect = () => ({top: index * 50, height: 50} as DOMRect); });
  return {onReorder, opened, row: (i: number) => screen.getAllByRole('listitem')[i]!};
}

it('moves a held row to where it is dropped, and does not open it', () => {
  const {onReorder, opened, row} = setup();
  fireEvent.pointerDown(row(0), {clientX: 10, clientY: 25, pointerId: 1});
  act(() => { vi.advanceTimersByTime(500); });
  fireEvent.pointerMove(row(0), {clientX: 10, clientY: 135, pointerId: 1});
  expect(row(1).style.transform).toBe('translateY(-50px)');
  fireEvent.pointerUp(row(0), {pointerId: 1});
  fireEvent.click(screen.getByText('Open a'));
  expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  expect(opened).not.toHaveBeenCalled();
  expect(row(1).style.transform).toBe('');
});

it('leaves a short press and a scroll alone', () => {
  const {onReorder, opened, row} = setup();
  fireEvent.pointerDown(row(1), {clientX: 10, clientY: 75, pointerId: 1});
  fireEvent.pointerUp(row(1), {pointerId: 1});
  fireEvent.click(screen.getByText('Open b'));
  expect(opened).toHaveBeenCalledWith('b');
  fireEvent.pointerDown(row(1), {clientX: 10, clientY: 75, pointerId: 2});
  fireEvent.pointerMove(row(1), {clientX: 10, clientY: 110, pointerId: 2});
  act(() => { vi.advanceTimersByTime(500); });
  fireEvent.pointerMove(row(1), {clientX: 10, clientY: 140, pointerId: 2});
  fireEvent.pointerUp(row(1), {pointerId: 2});
  expect(onReorder).not.toHaveBeenCalled();
});

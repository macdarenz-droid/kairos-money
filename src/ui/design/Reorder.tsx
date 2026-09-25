import {useEffect, useRef, useState, type ReactNode} from 'react';
import {moveInOrder} from '../../ledger/account-order';

const HOLD_MS = 450, SLOP_PX = 8;
type Drag = {id: string; startY: number; dy: number; tops: {id: string; top: number; height: number}[]};

/**
 * A list the owner reorders by pressing and holding a row, then dragging it.
 * Rows stay controls: a short press still reaches them, and a finished drag swallows its click.
 */
export function ReorderList<T>({items, keyOf, render, onReorder, label}: {items: readonly T[]; keyOf: (item: T) => string;
  render: (item: T) => ReactNode; onReorder: (ids: string[]) => void; label: string}) {
  const ids = items.map(keyOf);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>()), list = useRef<HTMLDivElement>(null);
  const press = useRef<{id: string; x: number; y: number; timer: number} | null>(null), swallow = useRef(false);

  // Scrolling must stop while a row is held; only a non-passive touch listener can prevent it.
  useEffect(() => {
    const node = list.current; if (!node || !drag) return;
    const hold = (event: TouchEvent) => event.preventDefault();
    node.addEventListener('touchmove', hold, {passive: false});
    return () => node.removeEventListener('touchmove', hold);
  }, [drag]);
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);

  const target = (state: Drag) => {
    const self = state.tops.find(row => row.id === state.id)!;
    const middle = self.top + self.height / 2 + state.dy;
    return state.tops.filter(row => row.id !== state.id && row.top + row.height / 2 < middle).length;
  };
  const shift = (id: string): number => {
    if (!drag) return 0;
    if (id === drag.id) return drag.dy;
    const from = ids.indexOf(drag.id), to = target(drag), at = ids.indexOf(id);
    const height = drag.tops.find(row => row.id === drag.id)!.height;
    if (from < to && at > from && at <= to) return -height;
    if (from > to && at < from && at >= to) return height;
    return 0;
  };
  const cancel = () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; };
  const finish = () => {
    cancel();
    if (!drag) return;
    const to = target(drag), from = ids.indexOf(drag.id);
    setDrag(null); swallow.current = true;
    if (to !== from) onReorder(moveInOrder(ids, drag.id, to - from));
  };

  return <div ref={list} className="reorder-list" aria-label={label} role="list"
    onClickCapture={event => { if (swallow.current) { swallow.current = false; event.preventDefault(); event.stopPropagation(); } }}>
    {items.map(item => { const id = keyOf(item); const offset = shift(id); return <div key={id} role="listitem" className="reorder-row"
      data-dragging={drag?.id === id || undefined} data-settling={(drag && drag.id !== id) || undefined}
      style={offset ? {transform: `translateY(${offset}px)`} : undefined}
      ref={node => { if (node) rows.current.set(id, node); else rows.current.delete(id); }}
      onContextMenu={event => { if (press.current || drag) event.preventDefault(); }}
      onPointerDown={event => {
        if (items.length < 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
        cancel(); swallow.current = false;
        const {clientX: x, clientY: y, pointerId} = event, node = event.currentTarget;
        press.current = {id, x, y, timer: window.setTimeout(() => {
          press.current = null;
          node.setPointerCapture?.(pointerId);
          setDrag({id, startY: y, dy: 0, tops: ids.map(other => { const box = rows.current.get(other)!.getBoundingClientRect(); return {id: other, top: box.top, height: box.height}; })});
        }, HOLD_MS)};
      }}
      onPointerMove={event => {
        if (drag) { setDrag({...drag, dy: event.clientY - drag.startY}); return; }
        const held = press.current;
        if (held && Math.hypot(event.clientX - held.x, event.clientY - held.y) > SLOP_PX) cancel();
      }}
      onPointerUp={finish} onPointerCancel={() => { cancel(); setDrag(null); }}>
      {render(item)}
    </div>; })}
  </div>;
}

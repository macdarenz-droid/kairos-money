import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { format, money, type Money } from '../../core/money';

/** True when motion must not run: the user asked for none, or the engine cannot draw frames. */
export function stillMotion(): boolean {
  if (typeof requestAnimationFrame !== 'function' || typeof matchMedia !== 'function') return true;
  return matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}

/** A coin flipping on its edge, for a button that is working. */
export function Coin() { return <span className="coin" aria-hidden="true"/>; }

/** Three coins drop and stack, then fade. Decorative; the caller owns the status label. */
export function CoinStack() {
  return <span className="coin-stack" aria-hidden="true"><span/><span/><span/></span>;
}

/** A wait with nothing new on screen yet. */
export function Loader({ label }: { label: string }) {
  return <div className="loader" role="status" aria-label={label}><CoinStack/><span className="meta" aria-hidden="true">{label}</span></div>;
}

const STEPS = 20, ROLL_MS = 600;

/** Exact bigint frames from the last shown value to `to`; runs once per value change, never on mount. */
export function useCountUp(to: bigint): bigint {
  const [shown, setShown] = useState(to);
  const last = useRef(to);
  useEffect(() => {
    const from = last.current;
    if (from === to || stillMotion()) { last.current = to; setShown(to); return; }
    const began = performance.now(); let frame = 0;
    // One clock: a frame timestamp can predate performance.now(), which gave a negative step.
    const step = () => {
      const i = Math.max(0, Math.min(STEPS, Math.floor((performance.now() - began) * STEPS / ROLL_MS)));
      const value = i >= STEPS ? to : from + (to - from) * BigInt(i) / BigInt(STEPS);
      last.current = value; setShown(value);
      if (i < STEPS) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return stillMotion() ? to : shown;
}

/** An amount that rolls to its new value. Only the final value is ever read aloud. */
export function CountUp({ value }: { value: Money }) {
  const frame = useCountUp(value.minor);
  const final = format(value);
  if (frame === value.minor) return <>{final}</>;
  return <><span className="count-up" aria-hidden="true">{format(money(frame, value.currency))}</span><span className="sr-only">{final}</span></>;
}

const LINES = {
  sort: ['Reading your merchant names', 'Matching each one to a category', 'Checking the unsure ones twice', 'Putting your categories in order'],
  review: ['Reading your figures', 'Looking at where the money went', 'Weighing what matters most', 'Writing your answer'],
} as const;
const NAMES = { sort: 'Kairos AI is sorting your categories', review: 'Kairos AI is writing your answer' } as const;

/** The Kairos AI mark; it moves only while `thinking`. */
export function KairosAiMark({ size, thinking = false, label }: { size: number; thinking?: boolean; label?: string }) {
  const gradient = `kai-${useId().replace(/:/g, '')}`;
  return <svg className={thinking ? 'kai-mark kai-thinking' : 'kai-mark'} width={size} height={size} viewBox="0 0 100 100"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8F97FF"/><stop offset="1" stopColor="#5EE3C1"/></linearGradient></defs>
    <g className="kai-orbit"><path d="M73.14 22.42A36 36 0 1 1 50 14" fill="none" stroke={`url(#${gradient})`} strokeWidth="7" strokeLinecap="round"/><circle cx="62.31" cy="16.17" r="5" fill="#5EE3C1"/></g>
    <path className="kai-spark" d="M50 29C51.6 42 58 48.4 71 50 58 51.6 51.6 58 50 71 48.4 58 42 51.6 29 50 42 48.4 48.4 42 50 29Z" fill={`url(#${gradient})`}/>
  </svg>;
}

/** Shown under the button while a Kairos AI call runs; screen readers hear one fixed label. */
export function KairosAiWorking({ kind }: { kind: 'sort' | 'review' }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer); }, []);
  const lines = LINES[kind];
  return <div className="kai-working" role="status" aria-label={NAMES[kind]}>
    <KairosAiMark size={36} thinking/>
    <span className="meta" aria-hidden="true">{lines[Math.floor(seconds / 3) % lines.length]}{seconds >= 10 ? ` · ${seconds} s` : ''}</span>
  </div>;
}

/** Opens a dialog in the top layer; a later one always sits above an earlier one. */
export function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const previous = document.body.style.overflow; if (typeof dialog?.showModal === 'function') dialog.showModal(); else dialog?.setAttribute('open', ''); document.body.style.overflow = 'hidden'; return () => { if (typeof dialog?.close === 'function') dialog.close(); else dialog?.removeAttribute('open'); document.body.style.overflow = previous; }; }, []);
  return ref;
}

/** A wait that covers the screen, above any open sheet; Escape cannot dismiss a running job. */
export function BusyOverlay({ message }: { message: string }) {
  const ref = useModal();
  return <dialog ref={ref} className="busy-dialog" aria-label={message} onCancel={event => event.preventDefault()}>
    <div className="busy-overlay" role="status" aria-live="polite" aria-atomic="true">
      <div className="busy-card"><CoinStack/><p>{message}</p></div>
    </div>
  </dialog>;
}

/** A coin drops into the check mark of a saved toast. */
export function SuccessDrop() {
  return <span className="success-drop" aria-hidden="true"><span className="success-coin"/><Check size={16}/></span>;
}

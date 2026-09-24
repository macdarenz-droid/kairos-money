import { useEffect, useRef, useState } from 'react';
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
const NAMES = { sort: 'Claude is sorting your categories', review: 'Claude is writing your answer' } as const;

/** Shown under the button while a Claude call runs; screen readers hear one fixed label. */
export function ClaudeWorking({ kind }: { kind: 'sort' | 'review' }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer); }, []);
  const lines = LINES[kind];
  return <div className={`claude-working claude-${kind}`} role="status" aria-label={NAMES[kind]}>
    {kind === 'sort'
      ? <span className="claude-jars" aria-hidden="true"><span className="claude-coin"/><span/><span/><span/></span>
      : <span className="claude-receipt" aria-hidden="true"><span/><span/><span/><span/></span>}
    <span className="meta" aria-hidden="true">{lines[Math.floor(seconds / 3) % lines.length]}{seconds >= 10 ? ` · ${seconds} s` : ''}</span>
  </div>;
}

/** A coin drops into the check mark of a saved toast. */
export function SuccessDrop() {
  return <span className="success-drop" aria-hidden="true"><span className="success-coin"/><Check size={16}/></span>;
}

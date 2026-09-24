import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type PropsWithChildren, type ReactNode } from 'react';
import { X, Home, List, Sparkles, UserRound, Search, Info } from 'lucide-react';
import { format, type Money } from '../../core/money';
import { Coin, SuccessDrop } from './Motion';
export function Surface({ children, className = '' }: PropsWithChildren<{ className?: string }>) { return <section className={`surface ${className}`}>{children}</section>; }
export function Row({ children, trailing }: PropsWithChildren<{ trailing?: ReactNode }>) { return <div className="row"><div>{children}</div>{trailing && <div className="row-trailing">{trailing}</div>}</div>; }
export function Label({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) { return <span className={muted ? 'label muted' : 'label'}>{children}</span>; }
export function Amount({ value, context, hero = false }: { value: Money; context: string; hero?: boolean }) {
  return <span className={`amount ${hero ? 'hero-amount' : ''}`} aria-label={`${value.minor < 0n ? 'Negative ' : ''}${format({ ...value, minor: value.minor < 0n ? -value.minor : value.minor })} ${value.currency}, ${context}`}>{format(value)}</span>;
}
export function Button({ children, variant = 'default', className = '', busy = false, busyLabel, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'quiet'; busy?: boolean; busyLabel?: ReactNode }) {
  return <button type="button" className={`button button-${variant} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>{busy ? <><Coin/>{busyLabel ?? children}</> : children}</button>;
}
export function Input({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string | undefined }) {
  const id = useId(); return <label className="input-label" htmlFor={id}><span id={`${id}-label`}>{label}</span><input id={id} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} {...props}/>{hint && <span id={`${id}-hint`} className="meta">{hint}</span>}</label>;
}
export function Sheet({ title, children, onClose }: PropsWithChildren<{ title: string; onClose: () => void }>) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog = ref.current; const previous = document.body.style.overflow; dialog?.showModal(); document.body.style.overflow = 'hidden'; return () => { dialog?.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog className="sheet" ref={ref} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right) onClose(); } }}>
    <header className="sheet-header"><h2 id={id}>{title}</h2><Button variant="quiet" className="icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={20}/></Button></header><div className="sheet-content">{children}</div>
  </dialog>;
}
/**
 * The explanation, one press away, instead of a paragraph nobody asked for.
 *
 * The app used to describe itself beside everything it offered: what a button would do, what a file is
 * kept in, what a chart is showing. All of it was true and all of it was addressed to a first-time reader
 * who no longer exists after the first day — so the screens read as instructions rather than as money.
 *
 * The rule this encodes: a screen shows what is, and says what a thing IS only when asked. Nothing is
 * removed from the app; it moves behind a mark small enough to ignore and specific enough to find.
 *
 * Deliberately not a tooltip. A tooltip has no touch target worth the name and vanishes on the way to
 * reading it; this is a real control with a real sheet behind it.
 */
export function Explain({ title, children }: PropsWithChildren<{ title: string }>) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="explain" aria-label={`What ${title} means`} onClick={() => setOpen(true)}>
      <Info size={15} strokeWidth={1.8} aria-hidden="true"/>
    </button>
    {open && <Sheet title={title} onClose={() => setOpen(false)}><div className="stack">{children}</div></Sheet>}
  </>;
}

export type Tab = 'Today' | 'Ledger' | 'Insights' | 'You';
export function Tabs({ current, onChange, onQuick }: { current: Tab; onChange: (tab: Tab) => void; onQuick: () => void }) {
  const icons = { Today: Home, Ledger: List, Insights: Sparkles, You: UserRound };
  return <nav className="tabs" aria-label="Primary"><div className="tabs-inner">{(['Today', 'Ledger', 'Quick', 'Insights', 'You'] as const).map(tab => {
    const Icon = tab === 'Quick' ? Search : icons[tab];
    return <button className={tab === 'Quick' ? 'tab tab-quick' : 'tab'} key={tab} aria-current={current === tab ? 'page' : undefined} onClick={() => tab === 'Quick' ? onQuick() : onChange(tab)}><span className="tab-icon"><Icon size={20} strokeWidth={1.65}/></span><span>{tab}</span></button>;
  })}</div></nav>;
}
export function Toast({ message, onDismiss, saved = false }: { message: string; onDismiss: () => void; saved?: boolean }) {
  useEffect(() => { const timer = setTimeout(onDismiss, 6000); return () => clearTimeout(timer); }, [onDismiss]);
  return <div className="toast" role="status"><span className="toast-message">{saved && <SuccessDrop/>}{message}</span><Button variant="quiet" className="icon-button" aria-label="Dismiss notification" onClick={onDismiss}><X size={16}/></Button></div>;
}
export function EmptyState({ icon, title, children, action }: PropsWithChildren<{ icon: ReactNode; title: string; action: ReactNode }>) {
  return <section className="empty-state"><div className="empty-icon" aria-hidden="true">{icon}</div><h2>{title}</h2><p>{children}</p><div className="empty-action">{action}</div></section>;
}
export function Skeleton({ label = 'Loading' }: { label?: string }) { return <div className="skeleton" role="status" aria-label={label}><span/><span/><span/></div>; }
export function DataGrid({ headings, rows, numeric = [] }: { headings: ReactNode[]; rows: string[][]; numeric?: number[] }) {
 return <div className="data-grid-scroll" tabIndex={0} aria-label="Raw export rows"><table className="data-grid"><thead><tr>{headings.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,20).map((r,i)=><tr key={i}>{r.map((v,j)=><td className={numeric.includes(j)?'amount':''} key={j}>{v}</td>)}</tr>)}</tbody></table>{rows.length>20 && <p className="meta">Showing the first 20 raw rows.</p>}</div>;
}

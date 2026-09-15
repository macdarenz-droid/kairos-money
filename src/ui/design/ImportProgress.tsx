/** An activity indicator, never a claim of percentage completion. */
export function ImportProgress({ message }: { message: string }) {
  return <div className="import-progress" role="status" aria-live="polite" aria-atomic="true">
    <svg className="import-progress-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect x="6" y="4" width="28" height="32" rx="3"/>
      <g className="import-progress-line"><path d="M12 13h9M26 13h2"/></g>
      <g className="import-progress-line"><path d="M12 20h7M25 20h3"/></g>
      <g className="import-progress-line"><path d="M12 27h11M26 27h2"/></g>
    </svg>
    <div><p>{message}</p><p className="meta">On your device. Your ledger stays unchanged until you confirm.</p></div>
  </div>;
}

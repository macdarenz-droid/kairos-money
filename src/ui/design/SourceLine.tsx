import {currency, format, money} from '../../core/money';

/**
 * Where a figure came from, in the words of the statement it came from.
 *
 * This used to render the stored payload straight into a <pre>, so tapping "Statement.pdf · 171" showed
 * the user a wall of JSON: accountId, fingerprint, runningBalance, confidence, mcc. That payload is kept
 * so a number can always be traced back to its source, which is worth keeping — but the trace a person
 * needs is the line on their statement, not the record the app made of it.
 *
 * Anything unparseable falls back to saying so plainly rather than dumping the blob as a consolation.
 */
export function SourceLine({file, row, raw}: {file: string; row: string; raw: string}) {
  let parsed: Record<string, unknown> | null = null;
  try { const value: unknown = JSON.parse(raw); if (value && typeof value === 'object') parsed = value as Record<string, unknown>; } catch { parsed = null; }

  const text = typeof parsed?.description === 'string' ? parsed.description : null;
  const date = typeof parsed?.date === 'string' ? parsed.date : null;
  const minor = typeof parsed?.minor === 'string' ? parsed.minor : null;
  const code = typeof parsed?.currency === 'string' ? parsed.currency : null;

  let amount: string | null = null;
  try { if (minor && code) amount = format(money(BigInt(minor), currency(code))); } catch { amount = null; }

  return <div className="section-gap">
    <p className="meta">From {file}, line {row}</p>
    {text ? <p>{text}</p> : <p className="meta">The original line could not be read back from this import.</p>}
    {(date || amount) && <p className="meta">{[date, amount].filter(Boolean).join(' · ')}</p>}
  </div>;
}

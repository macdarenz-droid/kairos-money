import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {editableCategories} from '../../ledger/categories';
import type {LedgerRow} from '../../ingest/types';
import {Button} from '../design/primitives';
import {useSession} from '../session';

/** On a row Claude sorted: pick the right category once and it applies to every row from that merchant. */
export function AiCategoryFix({row}: {row: LedgerRow}) {
  const session = useSession(), client = useQueryClient();
  const [category, setCategory] = useState(row.category ?? editableCategories[0]!), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  if (row.categoryFrom !== 'ai' || row.transferGroup) return null;
  async function apply() {
    setBusy(true); setError('');
    try { await session.run(repo => repo.merchantRules.set(row.merchant, category)); setDone(true); await client.invalidateQueries(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return <div className="stack" aria-label="Sorted by Claude">
    <p className="meta"><span className="tag">AI</span> Sorted by Claude. Wrong? Choose the right one.</p>
    <label className="input-label">Category<select value={category} onChange={e => setCategory(e.target.value)}>
      {editableCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
    <Button disabled={busy || done} onClick={() => void apply()}>{done ? 'Saved for this merchant' : 'All from this merchant'}</Button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

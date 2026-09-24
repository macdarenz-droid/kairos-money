import {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {editableCategories} from '../../ledger/categories';
import type {AiRun} from '../../ledger/ai-categories';
import {Button, Row, Sheet} from '../design/primitives';
import {KairosAiWorking} from '../design/Motion';
import {useSession} from '../session';
import {usd} from './cost';
import {estimateMicros, REASONS, sortMerchants, type SortReason} from './sort';

/** Claude suggests a category per merchant; confident answers apply as one undoable run, unsure ones wait here. */
export function SortCategories({onClose}: {onClose: () => void}) {
  const session = useSession(), client = useQueryClient();
  const preview = useQuery({queryKey: ['ai-sort-preview'], enabled: session.state === 'ready', staleTime: 0,
    queryFn: () => session.run(async repo => ({payload: await repo.aiCategories.payload(false), settings: await repo.advisor.settings(), runs: await repo.aiCategories.runs()}))});
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<SortReason | ''>(''), [error, setError] = useState('');
  const [latest, setLatest] = useState<AiRun | null>(null), [check, setCheck] = useState<AiRun['proposals']>([]), [shown, setShown] = useState(false), [pending, setPending] = useState(''), [undone, setUndone] = useState<string[]>([]);
  // Screens reload in the background, so a button frees as soon as its own write is done.
  const refresh = () => { void client.invalidateQueries(); };
  async function start() {
    setBusy(true); setFailure(''); setError('');
    try {
      const result = await sortMerchants(session.run, false);
      if (result.run) { setLatest(result.run); setCheck(result.run.proposals); refresh(); }
      if (!result.ok) setFailure(result.reason);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const guard = (tag: string, work: () => Promise<unknown>) => { setError(''); setPending(tag);
    void work().then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setPending('')); };
  const undo = (id: string) => guard('undo:' + id, async () => { await session.run(repo => repo.aiCategories.undoRun(id)); setUndone(list => [...list, id]); if (latest?.id === id) { setLatest(null); setCheck([]); } });
  const use = (key: string, category: string) => guard('use:' + key, async () => { await session.run(repo => repo.merchantRules.set(key, category)); setCheck(list => list.filter(p => p.key !== key)); });

  const data = preview.data, count = data?.payload.sent.merchants.length ?? 0, runs = data?.runs.filter(r => !undone.includes(r.id)) ?? [];
  return <Sheet title="Sort my categories" onClose={() => { if (!busy && !pending) onClose(); }}><div className="stack">
    <p>Kairos AI suggests a category for each merchant you have not sorted. Your own choices always win.</p>
    {!data ? <p>Reading your merchants…</p> : <>
      <p className="meta">{count} {count === 1 ? 'merchant' : 'merchants'} · about {usd(estimateMicros(data.payload, data.settings.model))}, estimated</p>
      <Button onClick={() => setShown(open => !open)} aria-expanded={shown}>See exactly what is sent</Button>
      {shown && <pre className="payload" aria-label="What is sent">{JSON.stringify({categories: editableCategories, examples: data.payload.sent.examples, merchants: data.payload.sent.merchants}, null, 2)}</pre>}
      <Button variant="primary" disabled={busy || !!pending || !count} onClick={() => void start()} busy={busy} busyLabel="Sorting…">Start sorting</Button>
      {busy && <KairosAiWorking kind="sort"/>}
    </>}
    {failure && <p role="alert">{REASONS[failure]} {latest ? 'The rest were not sorted.' : 'Nothing was changed.'}</p>}
    {error && <p role="alert">{error}</p>}
    {latest && <p role="status">Sorted {latest.applied.length} {latest.applied.length === 1 ? 'merchant' : 'merchants'}.</p>}
    {check.length > 0 && <section className="stack" aria-label="Check these"><h3>Check these</h3>
      {check.map(p => <Row key={p.key} trailing={<Button disabled={busy || !!pending} onClick={() => use(p.key, p.category)} busy={pending === 'use:' + p.key} busyLabel="Saving…">{`Use ${p.category}`}</Button>}>{p.key}</Row>)}</section>}
    {runs.length > 0 && <section className="stack" aria-label="Earlier runs"><h3>Earlier runs</h3>
      {runs.map(r => <Row key={r.id} trailing={<Button disabled={busy || !!pending} onClick={() => undo(r.id)} busy={pending === 'undo:' + r.id} busyLabel="Undoing…">Undo</Button>}>{r.at.slice(0, 10)} · {r.applied.length} {r.applied.length === 1 ? 'merchant' : 'merchants'}</Row>)}</section>}
  </div></Sheet>;
}

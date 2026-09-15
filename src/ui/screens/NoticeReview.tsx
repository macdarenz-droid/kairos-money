import {useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {currency, format, money} from '../../core/money';
import {capturedNotices, forgetNotices, readNotices} from '../../ingest/notices';
import {Button, Sheet} from '../design/primitives';
import type {ReadableNotice} from '../../ingest/notices';
import {useSession} from '../session';
import type {Account} from '../../core/db/repository';

/**
 * What the bank said happened, put to the person before any of it is recorded.
 *
 * One sheet listing everything captured since the app was last open, each line answered on its own. Not a
 * queue of separate prompts: five purchases in a day would be five interruptions, and by the third nobody
 * is reading them, which is the failure mode that makes a confirmation step worthless.
 *
 * Nothing here is recorded by being seen. A row leaves this list only when it is approved or rejected, and
 * closing the sheet leaves every undecided one for next time.
 */
export function NoticeReview({accounts, onClose}: {accounts: readonly Account[]; onClose: () => void}) {
  const session = useSession(), client = useQueryClient();
  const active = accounts.filter(a => !a.archived_at);
  const [accountId, setAccountId] = useState(active[0]?.id ?? '');
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [error, setError] = useState('');

  const captured = useQuery({queryKey: ['captured-notices'], queryFn: capturedNotices, enabled: session.state === 'ready'});
  const account = active.find(a => a.id === accountId);
  const code = currency(account?.currency ?? 'AUD');

  const read = useMemo(() => readNotices(captured.data ?? [], code), [captured.data, code]);
  const readable = read.readable.filter(item => !decided[item.notice.id]);
  const unreadable = read.unreadable;

  const settle = useMutation({
    mutationFn: async ({items, approve}: {items: readonly ReadableNotice[]; approve: boolean}) => {
      for (const item of items) {
        if (approve && account) {
          await session.run(repo => repo.notices.approve({
            id: item.notice.id, accountId: account.id, date: item.date, minor: item.minor,
            merchant: item.merchant, description: item.description,
            source: item.notice.source, capturedAt: new Date(item.notice.postedAt).toISOString(),
          }));
        }
      }
      // Forgotten either way: an answered notification is not kept on the phone waiting to be asked again.
      await forgetNotices(items.map(item => item.notice.id));
      return {ids: items.map(item => item.notice.id), approve};
    },
    onSuccess: async ({ids, approve}) => {
      setDecided(previous => ({...previous, ...Object.fromEntries(ids.map(id => [id, approve ? 'approved' as const : 'rejected' as const]))}));
      await client.invalidateQueries();
    },
    onError: e => setError(e instanceof Error ? e.message : 'That could not be saved. Nothing was recorded.'),
  });

  const decide = (items: readonly ReadableNotice[], approve: boolean) => { setError(''); settle.mutate({items, approve}); };
  const busy = settle.isPending;

  return <Sheet title="Did you spend this?" onClose={() => { if (!busy) onClose(); }}>
    <div className="stack" aria-busy={busy || undefined}>
      {captured.isPending ? <p>Reading what your bank told you.</p> : !readable.length
        ? <p>Nothing new from your bank to check.</p>
        : <>
          <p>Your bank said these happened. Nothing is recorded until you say so, and each one is recorded
            as unconfirmed until your statement shows it.</p>
          {active.length > 1 && <label className="input-label">These are from
            <select value={accountId} disabled={busy} onChange={e => setAccountId(e.target.value)}>
              {active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>}

          {readable.map(item => <div key={item.notice.id} className="notice-card">
            <div className="notice-head">
              <strong>{item.merchant}</strong>
              <span className="amount">{format(money(BigInt(item.minor), code))}</span>
            </div>
            <p className="meta">{item.date} · {item.notice.title}</p>
            <div className="notice-actions">
              <Button variant="primary" disabled={busy} onClick={() => decide([item], true)}>Approve</Button>
              <Button disabled={busy} onClick={() => decide([item], false)}>Reject</Button>
            </div>
          </div>)}

          {readable.length > 1 && <Button variant="quiet" disabled={busy} onClick={() => decide(readable, true)}>
            Approve all {readable.length}
          </Button>}
        </>}

      {unreadable.length > 0 && <details>
        <summary>{unreadable.length} {unreadable.length === 1 ? 'message was' : 'messages were'} not about a purchase</summary>
        {/* Said rather than silently dropped, so a notification the app cannot read is visibly a gap
            rather than a purchase that never happened. */}
        {unreadable.map(item =>
          <p key={item.notice.id} className="meta">{item.notice.title}: {item.reason}</p>)}
      </details>}

      {error && <p role="alert">{error}</p>}
      <Button disabled={busy} onClick={onClose}>Done</Button>
    </div>
  </Sheet>;
}

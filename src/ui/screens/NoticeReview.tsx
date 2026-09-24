import {useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {format, money} from '../../core/money';
import {capturedNotices, forgetNotices, routeNotices} from '../../ingest/notices';
import {pairNotices, type NoticeItem} from '../../ingest/notices/pair';
import {Button, Explain, Sheet} from '../design/primitives';
import {CategoryMark} from '../design/CategoryMark';
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
 *
 * Which account each one hits is decided per notification, not once for the whole sheet. It used to be one
 * dropdown governing every row, defaulting to whichever account happened to be first — so on a phone with
 * two banks, money landed on a coin toss made silently. Now the notice's own text is read first ("ending
 * 189"), then the account the owner nominated, then the first account whose currency the notice can be
 * read in — one rule, shared with the answers given in the notification shade — and the answer is shown
 * on the row so it can be corrected before anything is recorded. The correction is offered among the
 * accounts in the notice's currency only: an amount the bank wrote in pesos cannot land on a dollar
 * account, and the transfer legs already hold that line.
 */
export function NoticeReview({accounts, onClose}: {accounts: readonly Account[]; onClose: () => void}) {
  const session = useSession(), client = useQueryClient();
  const active = useMemo(() => accounts.filter(a => !a.archived_at), [accounts]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [error, setError] = useState('');

  const captured = useQuery({queryKey: ['captured-notices'], queryFn: capturedNotices, enabled: session.state === 'ready'});
  const fallback = useQuery({
    queryKey: ['notice-default-account'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.notices.defaultAccount()),
  });

  const read = useMemo(() => routeNotices(captured.data ?? [], active, fallback.data), [captured.data, active, fallback.data]);
  const unreadable = read.unreadable;
  const routed = useMemo(() => new Map(read.readable.map(item => [item.notice.id, item.accountId])), [read.readable]);

  const accountFor = useMemo(() => (item: ReadableNotice) =>
    chosen[item.notice.id] ?? routed.get(item.notice.id) ?? fallback.data ?? active[0]?.id ?? '',
  [chosen, routed, active, fallback.data]);

  const items = useMemo(
    () => pairNotices(read.readable.filter(item => !decided[item.notice.id]), accountFor),
    [read.readable, decided, accountFor]);

  const nameOf = (id: string) => active.find(a => a.id === id)?.name ?? 'an account';

  const settle = useMutation({
    mutationFn: async ({entries, approve}: {entries: readonly NoticeItem[]; approve: boolean}) => {
      const ids: string[] = [];
      for (const entry of entries) {
        if (entry.kind === 'transfer') {
          ids.push(entry.out.notice.id, entry.in.notice.id);
          if (!approve) continue;
          await session.run(repo => repo.notices.approve({
            id: entry.out.notice.id, accountId: entry.fromId, destinationId: entry.toId,
            date: entry.out.date, minor: entry.out.minor,
            merchant: `Transfer to ${nameOf(entry.toId)}`,
            description: `${entry.out.notice.title} · ${entry.in.notice.title}`,
            source: entry.out.notice.source, capturedAt: new Date(entry.out.notice.postedAt).toISOString(),
          }));
          continue;
        }
        ids.push(entry.item.notice.id);
        if (!approve) continue;
        await session.run(repo => repo.notices.approve({
          id: entry.item.notice.id, accountId: entry.accountId, date: entry.item.date,
          minor: entry.item.minor, merchant: entry.item.merchant, description: entry.item.description,
          source: entry.item.notice.source, capturedAt: new Date(entry.item.notice.postedAt).toISOString(),
        }));
      }
      // Forgotten either way: an answered notification is not kept on the phone waiting to be asked again.
      await forgetNotices(ids);
      return {ids, approve};
    },
    onSuccess: async ({ids, approve}) => {
      setDecided(previous => ({...previous, ...Object.fromEntries(ids.map(id => [id, approve ? 'approved' as const : 'rejected' as const]))}));
      await client.invalidateQueries();
    },
    onError: e => setError(e instanceof Error ? e.message : 'That could not be saved. Nothing was recorded.'),
  });

  const decide = (entries: readonly NoticeItem[], approve: boolean) => { setError(''); settle.mutate({entries, approve}); };
  const busy = settle.isPending;

  const picker = (noticeId: string, value: string, label: string, code: string) => {
    const same = active.filter(a => a.currency === code);
    return same.length > 1 &&
      <label className="input-label notice-account">{label}
        <select value={value} disabled={busy} onChange={e => setChosen(p => ({...p, [noticeId]: e.target.value}))}>
          {same.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>;
  };

  return <Sheet title="Check these transactions" onClose={() => { if (!busy) onClose(); }}>
    <div className="stack" aria-busy={busy || undefined}>
      {captured.isPending ? <p>Reading what your bank told you.</p> : !items.length
        ? <p>Nothing new from your bank to check.</p>
        : <>
          {items.map(entry => entry.kind === 'transfer'
            ? <div key={entry.out.notice.id} className="notice-card">
                <div className="notice-head">
                  <span className="row-lead">
                    <CategoryMark description="transfer"/>
                    <strong>{nameOf(entry.fromId)} → {nameOf(entry.toId)}</strong>
                  </span>
                  <span className="amount">{format(money(BigInt(entry.out.minor) < 0n ? -BigInt(entry.out.minor) : BigInt(entry.out.minor), entry.out.currency))}</span>
                </div>
                {/* The claim is a tag, and the reasoning behind it is one press away. Joining two notices
                    into one row IS the app making a claim about the owner's money, so it stays checkable —
                    but it does not need a paragraph on the row to be checkable. */}
                <p className="meta"><span className="tag">Transfer</span>
                  <Explain title="Why these two are one transfer">
                    <p>Both banks announced this within half an hour, for the same amount, and the money left
                      one of your accounts and arrived in another.</p>
                    <p>That means you moved your own money, so it is recorded as a transfer rather than as
                      spending. Change either account below if this is wrong.</p>
                    <p className="meta">{entry.out.notice.title}</p>
                    <p className="meta">{entry.in.notice.title}</p>
                  </Explain>
                </p>
                {picker(entry.out.notice.id, entry.fromId, 'Money left', entry.out.currency)}
                {picker(entry.in.notice.id, entry.toId, 'Money arrived in', entry.in.currency)}
                <div className="notice-actions">
                  <Button variant="primary" disabled={busy} onClick={() => decide([entry], true)}>Approve</Button>
                  <Button disabled={busy} onClick={() => decide([entry], false)}>Reject</Button>
                </div>
              </div>
            : <div key={entry.item.notice.id} className="notice-card">
                <div className="notice-head">
                  <span className="row-lead">
                    <CategoryMark description={`${entry.item.merchant} ${entry.item.notice.title}`}/>
                    <strong>{entry.item.merchant}</strong>
                  </span>
                  <span className="amount">{format(money(BigInt(entry.item.minor), entry.item.currency))}</span>
                </div>
                <p className="meta">{entry.item.date} · {entry.item.notice.title}</p>
                {picker(entry.item.notice.id, entry.accountId,
                  BigInt(entry.item.minor) < 0n ? 'Taken from' : 'Paid into', entry.item.currency)}
                <div className="notice-actions">
                  <Button variant="primary" disabled={busy} onClick={() => decide([entry], true)}>Approve</Button>
                  <Button disabled={busy} onClick={() => decide([entry], false)}>Reject</Button>
                </div>
              </div>)}

          {/* Not a quiet button. Sitting under three pairs of chromed ones, a borderless control reads as a
              caption and nobody presses it — and this is the row that matters most when the bank has sent
              five. It stays outlined rather than filled, so the per-purchase Approve is still the louder
              thing on the screen and approving everything at once takes the more deliberate press. */}
          {items.length > 1 && <Button disabled={busy} onClick={() => decide(items, true)}>
            Approve all {items.length}
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

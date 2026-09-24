import {routeNotices, type Notice, type NoticeAccount} from '../ingest/notices';
import type {NoticeRecord} from '../ledger/notices';

/**
 * Carries out the answers already given in the notification shade.
 *
 * Tapping "Yes, I did" on a locked phone cannot write to the ledger — its key only exists once Kairos is
 * unlocked — so the answer waited beside the captured notice. This is where it is honoured, on the next
 * unlock, which is the first moment the ledger can receive it. From the owner's side the purchase is
 * simply already in their history, and they are not asked about it a second time.
 *
 * Each notice lands on the account the same rule the in-app sheet uses would put it on: the account it
 * names, else the main account, else the first account whose currency it can be read in. It used to land
 * on the first account by name, read in that account's currency, and a receipt in any other currency was
 * silently dropped — which is how money he had approved arrived nowhere.
 *
 * An approved notice the parser cannot read in any held currency is left alone rather than forced into the
 * ledger: it stays to be shown among the messages that were not about a purchase, where it is visible
 * rather than invented.
 */
export async function applyShadeDecisions(
  notices: readonly Notice[], accounts: readonly NoticeAccount[], fallbackId: string | null | undefined,
  approve: (record: NoticeRecord) => Promise<unknown>, forget: (ids: string[]) => Promise<void>,
): Promise<{approved: number; rejected: number; unrecorded: number}> {
  const answered = notices.filter(notice => notice.decision === 'approved' || notice.decision === 'rejected');
  if (!answered.length) return {approved: 0, rejected: 0, unrecorded: 0};

  const {readable, unreadable} = routeNotices(answered.filter(n => n.decision === 'approved'), accounts, fallbackId);
  const settled: string[] = [];
  for (const item of readable) {
    await approve({
      id: item.notice.id, accountId: item.accountId, date: item.date, minor: item.minor,
      merchant: item.merchant, description: item.description,
      source: item.notice.source, capturedAt: new Date(item.notice.postedAt).toISOString(),
    });
    settled.push(item.notice.id);
  }
  const rejected = answered.filter(n => n.decision === 'rejected').map(n => n.id);
  await forget([...settled, ...rejected]);
  return {approved: settled.length, rejected: rejected.length, unrecorded: unreadable.length};
}

/**
 * The answered notices this unlock has not yet carried out.
 *
 * The app used to remember only THAT it had applied shade answers, as one flag set at the first batch.
 * Every answer given after that, for as long as the app stayed alive in the background, was neither
 * applied nor asked about: it carried a decision, so the sheet skipped it, and the flag was already set,
 * so the shade path skipped it too. Remembering WHICH notices were handled, by id, means a new answer is
 * always new.
 */
export function shadeBatch(notices: readonly Notice[], handled: ReadonlySet<string>): Notice[] {
  return notices.filter(notice => (notice.decision === 'approved' || notice.decision === 'rejected') && !handled.has(notice.id));
}

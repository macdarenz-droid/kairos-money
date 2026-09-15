import {readNotices, type Notice} from '../ingest/notices';
import type {Currency} from '../core/money';
import type {NoticeRecord} from '../ledger/notices';

/**
 * Carries out the answers already given in the notification shade.
 *
 * Tapping "Yes, I did" on a locked phone cannot write to the ledger — its key only exists once Kairos is
 * unlocked — so the answer waited beside the captured notice. This is where it is honoured, on the next
 * unlock, which is the first moment the ledger can receive it. From the owner's side the purchase is
 * simply already in their history, and they are not asked about it a second time.
 *
 * An approved notice the parser cannot read is left alone rather than forced into the ledger: it stays to
 * be shown among the messages that were not about a purchase, where it is visible rather than invented.
 */
export async function applyShadeDecisions(
  notices: readonly Notice[], code: Currency, accountId: string,
  approve: (record: NoticeRecord) => Promise<unknown>, forget: (ids: string[]) => Promise<void>,
): Promise<{approved: number; rejected: number}> {
  const answered = notices.filter(notice => notice.decision === 'approved' || notice.decision === 'rejected');
  if (!answered.length) return {approved: 0, rejected: 0};

  const {readable} = readNotices(answered.filter(n => n.decision === 'approved'), code);
  const settled: string[] = [];
  for (const item of readable) {
    await approve({
      id: item.notice.id, accountId, date: item.date, minor: item.minor,
      merchant: item.merchant, description: item.description,
      source: item.notice.source, capturedAt: new Date(item.notice.postedAt).toISOString(),
    });
    settled.push(item.notice.id);
  }
  const rejected = answered.filter(n => n.decision === 'rejected').map(n => n.id);
  await forget([...settled, ...rejected]);
  return {approved: settled.length, rejected: rejected.length};
}

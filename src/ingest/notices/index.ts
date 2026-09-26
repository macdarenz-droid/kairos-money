import {parseNotice, type Notice, type NoticeAmount, type ParsedNotice} from './parse';
import type {Currency} from '../../core/money';
import type {NoticeRecord} from '../../ledger/notices';
import {localDay} from '../reminders';

export type {Notice, ParsedNotice, NoticeAmount} from './parse';
export {Notices, capturedNotices, forgetNotices, noticeAccess, noticesAvailable, watchSources, installedSources} from './bridge';
export type {NoticeAccess, NoticeSource} from './bridge';
export {routeNotices, accountFromNotice} from './route';
export type {NoticeAccount, RoutedNotice} from './route';

export type ReadableNotice = {notice: Notice} & Extract<ParsedNotice, {status: 'ok'}>;
/** `amounts` and `accountId` are set only when the notice failed for carrying several amounts. */
export type UnreadableNotice = {notice: Notice; reason: string; amounts?: NoticeAmount[]; accountId?: string; merchant?: string};

/**
 * Everything the phone captured, split into what can be put to a person and what cannot.
 *
 * The screen asks for this rather than parsing notices itself: reading a bank's wording is ingest work,
 * and the layering guard in the tests exists to keep that kind of decision out of the components.
 */
export function readNotices(notices: readonly Notice[], code: Currency): {readable: ReadableNotice[]; unreadable: UnreadableNotice[]} {
  const readable: ReadableNotice[] = [], unreadable: UnreadableNotice[] = [];
  for (const notice of notices) {
    const parsed = parseNotice(notice, code);
    if (parsed.status === 'ok') readable.push({notice, ...parsed});
    else unreadable.push({notice, reason: parsed.reason});
  }
  return {readable, unreadable};
}

/** The record for an amount the owner picked from a notice that carried several. */
export function pickedRecord(item: UnreadableNotice & {accountId: string}, amount: NoticeAmount): NoticeRecord {
  return {
    id: item.notice.id, accountId: item.accountId, date: localDay(new Date(item.notice.postedAt)), minor: amount.minor,
    merchant: item.merchant ?? item.notice.title, description: item.notice.text,
    source: item.notice.source, capturedAt: new Date(item.notice.postedAt).toISOString(),
  };
}

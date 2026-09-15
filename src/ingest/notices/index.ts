import {parseNotice, type Notice, type ParsedNotice} from './parse';
import type {Currency} from '../../core/money';

export type {Notice, ParsedNotice} from './parse';
export {capturedNotices, forgetNotices, noticeAccess, noticesAvailable, watchSources, installedSources} from './bridge';
export type {NoticeAccess, NoticeSource} from './bridge';

export type ReadableNotice = {notice: Notice} & Extract<ParsedNotice, {status: 'ok'}>;
export type UnreadableNotice = {notice: Notice; reason: string};

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

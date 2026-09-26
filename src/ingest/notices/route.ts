import {currency} from '../../core/money';
import {parseNotice, type Notice} from './parse';
import type {ReadableNotice, UnreadableNotice} from './index';

export type RoutableAccount = {id: string; mask_last4: string | null};

/**
 * Digits a bank prints to say which account a notification is about.
 *
 * Only after a word that means "this identifies the account". A bare run of digits is not enough: an
 * amount, a receipt number and a store number are all digits, and "WITHDRAWAL-OSKO PAYMENT 4471902" would
 * otherwise route money by its reference number. "ending 407", "acct ••3318", "card x1234" are claims
 * about identity; "$3.00" is not.
 */
const IDENTIFIER = /\b(?:ending(?:\s+in)?|acct\.?|account|card|a\/c)\b[^0-9a-zA-Z]{0,12}(\d{3,4})\b/gi;

/**
 * Which of the owner's accounts a notification is about, or null when the text does not say.
 *
 * Banks do not agree on how many digits to print — CommBank says "ending 407", others print all four — so
 * a three-digit tail is matched as a suffix of the stored mask rather than as an equal string. That is a
 * looser test, which is why an ambiguous answer is refused: if two accounts both end 407, the notice has
 * not identified either and the caller falls back to the account the owner chose.
 *
 * Returning null is the normal case, not a failure. Most notifications name no account at all, and an
 * account guessed from a reference number would put real money on the wrong ledger.
 */
export function accountFromNotice(text: string, accounts: readonly RoutableAccount[]): string | null {
  const masked = accounts.filter(account => account.mask_last4);
  if (!masked.length) return null;

  const matched = new Set<string>();
  for (const found of text.matchAll(IDENTIFIER)) {
    const digits = found[1]!;
    for (const account of masked) if (account.mask_last4!.endsWith(digits)) matched.add(account.id);
  }
  // One account, named once or several times, is an answer. Two different accounts is not.
  return matched.size === 1 ? [...matched][0]! : null;
}

export type NoticeAccount = RoutableAccount & {currency: string; archived_at?: string | null; name?: string | null; institution?: string | null};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The one active account whose bank or name is a whole word of the notification's title, else null. */
export function accountFromSender(title: string, active: readonly NoticeAccount[]): string | null {
  const says = (word: string | null | undefined) => Boolean(word?.trim()) &&
    new RegExp(`(?:^|[^A-Za-z0-9])${escape(word!.trim())}(?:$|[^A-Za-z0-9])`, 'i').test(title);
  const matched = active.filter(account => says(account.institution) || says(account.name));
  return matched.length === 1 ? matched[0]!.id : null;
}
export type RoutedNotice = ReadableNotice & {accountId: string};

/**
 * WHERE EACH NOTIFICATION LANDS, decided once, for the sheet and for the shade alike.
 *
 * "i just received money from someone. the app read it and clicked approved. but didnt reflect on my
 * balance, no money in. no additional balance everywhere."
 *
 * The answer he tapped in the shade was carried out against ONE account — whichever sorted first by
 * name — and its currency. The in-app sheet, meanwhile, routed each row on its own. Two rules for one
 * job, and the shade's was the wrong one: a receipt written in the wallet's currency, read against the
 * bank's, parsed as "in PHP, not AUD" and was left alone, unrecorded, unmentioned, and never asked about
 * again because it already carried an answer. The money arrived; the ledger never heard.
 *
 * One rule now. The account is chosen before the amount is read, because the amount cannot be read
 * without knowing which currency a bare "$" means:
 *
 *   1. An account the notice names itself ("ending 407") wins outright, and the notice is read in that
 *      account's currency. Where the text disagrees with the account, the notice is unreadable, not
 *      re-routed: the bank has named an account and the app does not overrule it.
 *   2. Otherwise the one account whose bank or name the title carries, then the main one, then the rest in the order given, are
 *      tried in turn, one attempt per DISTINCT currency. A notice saying "PHP 500" fails against an AUD
 *      account and succeeds against the first PHP one; a notice saying "$5" succeeds at the first try,
 *      in the main account, exactly as before.
 *   3. Nothing readable in any held currency: the reason from the first attempt is what is shown, since
 *      that is the account the owner would have expected it on.
 *
 * Archived accounts are never a destination for money.
 */
export function routeNotices(
  notices: readonly Notice[], accounts: readonly NoticeAccount[], fallbackId: string | null | undefined,
): {readable: RoutedNotice[]; unreadable: UnreadableNotice[]} {
  const active = accounts.filter(account => !account.archived_at);
  const readable: RoutedNotice[] = [], unreadable: UnreadableNotice[] = [];
  for (const notice of notices) {
    if (!active.length) { unreadable.push({notice, reason: 'There is no active account to record this on.'}); continue; }
    const named = accountFromNotice(`${notice.title} ${notice.text}`, active);
    const sender = named ? undefined : active.find(account => account.id === accountFromSender(notice.title, active));
    const fallback = fallbackId ? active.find(account => account.id === fallbackId) : undefined;
    const lead = [...new Set([sender, fallback].filter((a): a is NoticeAccount => Boolean(a)))];
    const candidates = named
      ? [active.find(account => account.id === named)!]
      : [...lead, ...active.filter(account => !lead.includes(account))];
    let first: UnreadableNotice | null = null, landed: RoutedNotice | null = null;
    const tried = new Set<string>();
    for (const account of candidates) {
      if (tried.has(account.currency)) continue;
      tried.add(account.currency);
      const parsed = parseNotice(notice, currency(account.currency));
      if (parsed.status === 'ok') { landed = {notice, ...parsed, accountId: account.id}; break; }
      first ??= parsed.amounts ? {notice, reason: parsed.reason, amounts: parsed.amounts, accountId: account.id, ...(parsed.merchant ? {merchant: parsed.merchant} : {})} : {notice, reason: parsed.reason};
    }
    if (landed) readable.push(landed); else unreadable.push(first ?? {notice, reason: 'The notification could not be read.'});
  }
  return {readable, unreadable};
}

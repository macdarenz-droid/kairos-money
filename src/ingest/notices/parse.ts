import {currency, money, parseDecimal, type Currency} from '../../core/money';

/** `decision` carries an answer already given in the notification shade, before the app was opened. */
export type Notice = {id: string; source: string; title: string; text: string; postedAt: number; decision?: 'approved' | 'rejected' | null};
export type ParsedNotice =
  | {status: 'ok'; minor: string; currency: Currency; merchant: string; date: string; description: string}
  | {status: 'skip'; reason: string};

/**
 * A bank's own push notification, read as a possible transaction.
 *
 * This is the weakest evidence the app can hold. There is no running balance, no reference and no posting
 * date — only the moment the phone showed it — and a card notification is usually an authorisation rather
 * than a settled purchase, so the amount can still change and it can be reversed. Nothing here is ever
 * written to the ledger on its own: a parse produces something to be shown and agreed to, and what is
 * agreed lands as a pending row that the real statement later supersedes.
 *
 * The rule throughout is that an unreadable notice is skipped, never guessed. A wrong row a person waves
 * through is worse than no row at all, because it looks like evidence.
 */

// Balance lines carry a second amount that is not the transaction. They are removed before counting, so a
// notice reading "You spent $12.50. Available balance $431.20" is not treated as ambiguous — and a notice
// that is ONLY a balance has no amount left and is skipped.
const BALANCE = /\b(?:available|remaining|current|new|closing|acct|account)?\s*(?:bal|balance|funds)\b[^\d\n]{0,24}(?:[A-Z]{3}\s*)?[$€£¥]?\s*\d[\d,]*(?:\.\d{1,3})?/gi;
const OUTWARD = /\b(?:spent|purchase|purchased|debited|debit|withdrawn|withdrawal|paid|payment|charged|sent|transfer(?:red)? to)\b/i;
const INWARD = /\b(?:received|deposit|deposited|credited|credit|refund(?:ed)?|transfer(?:red)? from)\b/i;
// A run of digits is only an amount when the bank marked it as one: a currency code, a symbol, or cents.
// Without that rule a card suffix or a store number ("WOOLWORTHS 1234") counts as a second amount and
// every ordinary notice is thrown away as ambiguous.
const AMOUNT = /(?:(?<code>AUD|USD|PHP|EUR|GBP|NZD|CAD|SGD|JPY|KWD)\s*)?(?<symbol>[$€£¥])?\s*(?<whole>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?<fraction>\d{1,3}))?/g;
const MERCHANT = /\b(?:at|to|from)\s+([^.,;\n]{2,60})/i;

/**
 * @param expected the currency of the account these notices belong to. A bare "$" means that currency; an
 * explicit code that disagrees with it is not converted or assumed, it is skipped.
 */
export function parseNotice(notice: Notice, expected: Currency): ParsedNotice {
  const body = `${notice.title} ${notice.text}`.replace(/\s+/g, ' ').trim();
  if (!body) return {status: 'skip', reason: 'The notification had no text to read.'};
  if (body.length > 400) return {status: 'skip', reason: 'The notification is too long to read as one transaction.'};
  if (/\b(?:one[- ]?time|verification|security|otp|passcode|log ?in|sign ?in)\b/i.test(body))
    return {status: 'skip', reason: 'This looks like a security message, not a purchase.'};

  const outward = OUTWARD.test(body), inward = INWARD.test(body);
  if (outward === inward) return {status: 'skip', reason: 'The notification does not say whether money went out or came in.'};

  const spendable = body.replace(BALANCE, ' ');
  const amounts = [...spendable.matchAll(AMOUNT)]
    .map(match => match.groups!)
    .filter(groups => groups['code'] || groups['symbol'] || groups['fraction'] !== undefined);
  if (!amounts.length) return {status: 'skip', reason: 'No amount could be read from the notification.'};
  if (amounts.length > 1) return {status: 'skip', reason: 'The notification carries more than one amount, so which one was spent is unclear.'};

  const {code, whole, fraction} = amounts[0]! as {code?: string; whole?: string; fraction?: string};
  if (code && code !== expected) return {status: 'skip', reason: `The notification is in ${code}, not ${expected}.`};

  const digits = (whole ?? '').replace(/,/g, '') + (fraction === undefined ? '' : `.${fraction}`);
  let value;
  try { value = parseDecimal(digits, currency(expected)); }
  catch { return {status: 'skip', reason: 'The amount could not be read exactly.'}; }
  if (value.minor === 0n) return {status: 'skip', reason: 'The notification reports no money moving.'};

  const named = MERCHANT.exec(body)?.[1]?.trim();
  return {
    status: 'ok',
    minor: money(outward ? -value.minor : value.minor, value.currency).minor.toString(),
    currency: value.currency,
    // Where the bank did not name anyone, its own words stand in. Inventing a merchant would put a name in
    // the ledger that no statement will ever confirm.
    merchant: named && !/^\d+$/.test(named) ? named : body.slice(0, 60),
    date: new Date(notice.postedAt).toISOString().slice(0, 10),
    description: body,
  };
}

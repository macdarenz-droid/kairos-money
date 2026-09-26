import {currency, currencyDigits, money, parseDecimal, type Currency} from '../../core/money';
import {localDay} from '../reminders';

/** `decision` carries an answer already given in the notification shade, before the app was opened. */
export type Notice = {id: string; source: string; title: string; text: string; postedAt: number; decision?: 'approved' | 'rejected' | null};
export type ParsedNotice =
  | {status: 'ok'; minor: string; currency: Currency; merchant: string; date: string; description: string}
  | {status: 'skip'; reason: string; amounts?: NoticeAmount[]; merchant?: string};
/** One amount a notice carries, signed by its wording, so the owner can pick which one moved. */
export type NoticeAmount = {minor: string; currency: Currency};

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
const BALANCE = /\b(?:available|remaining|current|new|closing|acct|account)?\s*(?:bal|balance|funds)\b[^\d\n]{0,24}(?:[A-Z]{3}\s*)?[$€£¥₱]?\s*\d[\d,]*(?:\.\d{1,3})?/gi;
const INWARD_PHRASE = /\b(?:been paid|paid into|paid to you|received|deposit(?:ed)?|credited|refund(?:ed)?|transfer(?:red)? from|money in)\b/i;
const OUTWARD_PHRASE = /\b(?:you spent|spent|purchase(?:d)?|debited|withdrawn|withdrawal|paid from|paid to|payment to|charged|sent to|transfer(?:red)? to|money out)\b/i;
const OUTWARD_WORD = /\b(?:debit|paid|payment|sent)\b/i;
const INWARD_WORD = /\b(?:credit|pay)\b/i;
// A wallet name says how, not which way: a bare "Apple Pay $12.50" is a purchase, but its "Pay" is not pay.
const WALLET = /\b(?:apple|google|samsung) pay\b/gi;
// A run of digits is only an amount when the bank marked it as one: a currency code, a symbol, or cents.
// Without that rule a card suffix or a store number ("SYNTHETIC GROCER 1234") counts as a second amount
// and every ordinary notice is thrown away as ambiguous.
//
// The code is matched as ANY standalone three-letter word and validated afterwards against the
// currencies this app knows, rather than listed here. Two reasons, and the second is the one that bit:
// the list cannot drift out of step with currencyDigits, and a written list has a case. Philippine
// banks and e-wallets write "PHP", "Php" and "php" interchangeably, and a case-sensitive list read
// only the first. A three-letter word that is not a currency ("Ref", "THS" inside a shouted merchant)
// simply fails validation and the digits after it are judged on their own.
//
// ₱ is in the symbol class for the same region. GCash writes round amounts as "₱1,200" with no cents,
// which carried no code, no known symbol and no fraction — so the commonest message a Philippine user
// gets was read as having no amount at all and silently skipped.
const AMOUNT = /(?:(?<code>\b[A-Za-z]{3}\b)\s*)?(?<symbol>[$€£¥₱])?\s*(?<whole>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?<fraction>\d{1,3}))?/g;
/** A three-letter word is a currency only if this app has one by that name. Case is the bank's business. */
function declaredCurrency(code: string | undefined): string | undefined {
  const upper = code?.toUpperCase();
  return upper && Object.hasOwn(currencyDigits, upper) ? upper : undefined;
}
const MERCHANT = /\b(?:at|to|from)\s+([^.,;\n]{2,60})/i;
const GENERIC = /^(?:your |my |the )?(?:account|acct|card|balance|you)\b/i;
const STATEMENT_STYLE = /\b[A-Z][A-Z0-9&'*-]{2,}(?:[ -][A-Z0-9&'*-]{2,}){0,5}\b/;

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

  // An explicit phrase settles it; a bare verb is only asked when no phrase matched, because "paid" alone
  // means opposite things in "paid from your account" and "you've been paid".
  const bare = body.replace(WALLET, ' ');
  const inwardPhrase = INWARD_PHRASE.test(bare), outwardPhrase = OUTWARD_PHRASE.test(bare);
  const decided = inwardPhrase !== outwardPhrase
    ? {inward: inwardPhrase, outward: outwardPhrase}
    : inwardPhrase && outwardPhrase
      ? null                                        // Says both; not resolved by preferring either.
      : {inward: INWARD_WORD.test(bare), outward: OUTWARD_WORD.test(bare) || bare !== body};
  if (!decided || decided.inward === decided.outward)
    return {status: 'skip', reason: 'The notification does not say whether money went out or came in.'};
  const outward = decided.outward;

  const spendable = body.replace(BALANCE, ' ');
  const amounts = [...spendable.matchAll(AMOUNT)]
    .map(match => {
      const groups = match.groups as {code?: string; symbol?: string; whole?: string; fraction?: string};
      return {...groups, declared: declaredCurrency(groups.code)};
    })
    .filter(groups => groups.declared || groups.symbol || groups.fraction !== undefined);
  if (!amounts.length) return {status: 'skip', reason: 'No amount could be read from the notification.'};
  if (amounts.length > 1) {
    const offered: NoticeAmount[] = [];
    for (const {declared, whole, fraction} of amounts) {
      if (declared && declared !== expected) continue;
      let value;
      try { value = parseDecimal((whole ?? '').replace(/,/g, '') + (fraction === undefined ? '' : `.${fraction}`), currency(expected)); }
      catch { continue; }
      const minor = (outward ? -value.minor : value.minor).toString();
      if (value.minor !== 0n && !offered.some(a => a.minor === minor)) offered.push({minor, currency: value.currency});
    }
    const merchant = nameIn(body);
    return {status: 'skip', reason: 'The notification carries more than one amount, so which one was spent is unclear.', amounts: offered, ...(merchant ? {merchant} : {})};
  }

  const {declared, whole, fraction} = amounts[0]!;
  if (declared && declared !== expected) return {status: 'skip', reason: `The notification is in ${declared}, not ${expected}.`};

  const digits = (whole ?? '').replace(/,/g, '') + (fraction === undefined ? '' : `.${fraction}`);
  let value;
  try { value = parseDecimal(digits, currency(expected)); }
  catch { return {status: 'skip', reason: 'The amount could not be read exactly.'}; }
  if (value.minor === 0n) return {status: 'skip', reason: 'The notification reports no money moving.'};

  const named = nameIn(body);
  return {
    status: 'ok',
    minor: money(outward ? -value.minor : value.minor, value.currency).minor.toString(),
    currency: value.currency,
    // Where the bank did not name anyone, its own words stand in. Inventing a merchant would put a name in
    // the ledger that no statement will ever confirm.
    merchant: named ?? body.slice(0, 60),
    // THE PHONE'S OWN DAY, not the UTC one. This took the UTC date of the moment the notice was shown, so
    // on a phone eight hours ahead every notification before eight in the morning was dated yesterday:
    // absent from "Recorded today", and the day's own figures a day out. The ledger's idea of today is
    // localDay() everywhere else, and a notice is dated by the same clock.
    date: localDay(new Date(notice.postedAt)),
    description: body,
  };
}

/** Who the bank says was paid or paid you, or undefined when it names no one. */
function nameIn(body: string): string | undefined {
  const candidate = MERCHANT.exec(body)?.[1]?.trim();
  const shouted = STATEMENT_STYLE.exec(body.replace(/^[^ ]+ /, ''))?.[0]?.trim();
  const named = candidate && !GENERIC.test(candidate) ? candidate : shouted;
  return named && !/^\d+$/.test(named) ? named : undefined;
}

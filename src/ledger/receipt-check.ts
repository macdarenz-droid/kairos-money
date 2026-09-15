import {currencyDigits, format, money, type Currency} from '../core/money';

export type ReceiptCheck =
  | {status: 'agrees'; totalMinor: string}
  | {status: 'differs'; totalMinor: string; differenceMinor: string}
  | {status: 'unreadable'; reason: string};

// "TOTAL 43.20" is the line that matters; "SUBTOTAL" and "TOTAL SAVINGS" are not the amount paid.
const TOTAL_LINE = /^(?!.*\b(?:sub[\s-]?total|savings|saved|discount|change|cash|points|gst|tax|tender)\b).*\btotal\b.*$/i;
const AMOUNT = /(?:[$€£¥]\s*)?(\d[\d.,]*\d)\b/g;

/**
 * Minor units from a written amount, or null when the separators leave it ambiguous.
 *
 * "1,234.56" and "1.234,56" are both unambiguous because two different separators appear and the last one
 * is the decimal. A number with only one separator is not: "1.234" is a thousand-odd in one convention and
 * one-and-a-bit in another, and reading it wrongly puts a confident, wrong figure beside a statement.
 */
function minorUnits(written: string): bigint | null {
  const lastDot = written.lastIndexOf('.'), lastComma = written.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const [whole, cents] = written.split(decimal).map(part => part.replace(/[.,]/g, ''));
    return cents?.length === 2 ? BigInt(`${whole}${cents}`) : null;
  }
  const only = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
  if (!only) return null;                            // Whole units with no cents: not a till total.
  const [whole, cents] = written.split(only);
  if (written.split(only).length !== 2 || cents?.length !== 2) return null;
  return BigInt(`${whole}${cents}`);
}

/**
 * What a photographed receipt says the total was, checked against what the ledger recorded.
 *
 * Taking the photo used to do nothing a person could see: the text was read on the device and then shown
 * back as a wall of raw OCR. This is the reason to take it. The receipt is the only record of what was
 * actually paid at the till, so the one question it can settle that a statement cannot is whether the
 * amount that reached the account is the amount on the docket — a tip, a later adjustment or a row matched
 * to the wrong purchase all show up as a difference.
 *
 * It answers only when it is sure. One unambiguous total line or nothing: a guessed figure contradicting a
 * statement would be worse than silence, because it invites someone to "correct" a ledger that was right.
 */
export function checkReceipt(text: string, recordedMinor: string, code: Currency): ReceiptCheck {
  if (!text.trim()) return {status: 'unreadable', reason: 'No text could be read from this photo.'};
  const digits = currencyDigits[code];
  if (digits !== 2) return {status: 'unreadable', reason: `Receipt totals are only checked for currencies with cents, and ${code} does not use them.`};

  const candidates = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!TOTAL_LINE.test(line)) continue;
    for (const match of line.matchAll(AMOUNT)) {
      const value = minorUnits(match[1]!);
      if (value !== null) candidates.add(value.toString());
    }
  }
  if (!candidates.size) return {status: 'unreadable', reason: 'No total could be read from this photo.'};
  if (candidates.size > 1) return {status: 'unreadable', reason: 'This photo shows more than one total, so which was paid is unclear.'};

  const total = BigInt([...candidates][0]!);
  const recorded = BigInt(recordedMinor) < 0n ? -BigInt(recordedMinor) : BigInt(recordedMinor);
  money(total, code);
  if (total === recorded) return {status: 'agrees', totalMinor: total.toString()};
  const difference = total > recorded ? total - recorded : recorded - total;
  return {status: 'differs', totalMinor: total.toString(), differenceMinor: difference.toString()};
}

/** One sentence a person can act on, or one that says plainly why there is nothing to say. */
export function describeReceipt(check: ReceiptCheck, code: Currency): string {
  if (check.status === 'unreadable') return check.reason;
  const total = format(money(BigInt(check.totalMinor), code));
  if (check.status === 'agrees') return `This receipt says ${total}, which matches what was recorded.`;
  return `This receipt says ${total}, which is ${format(money(BigInt(check.differenceMinor), code))} away from what was recorded. A tip, a later adjustment, or a photo attached to the wrong purchase would each explain that.`;
}

export type StatementDetails = { start: string; end: string; opening: string; closing: string };
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function namedDate(day: string, month: string, year: string): string | null {
  const index = months.findIndex(value => value === month.toLowerCase() || value.slice(0, 3) === month.toLowerCase());
  if (index < 0) return null;
  const date = `${year}-${String(index + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
const signed = (sign: string | undefined, figure: string) => (sign === '-' ? '-' : '') + figure.replaceAll(',', '');
/**
 * What the file says about itself: the period it covers and the balances it opens and closes on.
 *
 * Only layouts whose wording is known are read, and only when every one of the four figures is found.
 * A statement that states three of them gets nothing, not a guess at the fourth — the balances are what
 * the whole import is checked against, and a wrong one would quarantine every row behind it.
 */
export function statementDetails(text: string): StatementDetails | null {
  // A Westpac TRANSACTIONS REPORT is not a statement: it is a window somebody asked for, printed newest
  // first, headed "This report covers transactions from … to …" with a Start Balance and an End Balance.
  // It also carries the words "Westpac Choice", so it is recognised before the statement layout below,
  // which would otherwise claim it and then find none of the statement wording.
  if (/Transactions\s+report/i.test(text) && /Westpac/i.test(text)) {
    const period = /covers\s+transactions\s+from\s+(\d{1,2})-([a-z]{3,9})-(\d{4})\s+to\s+(\d{1,2})-([a-z]{3,9})-(\d{4})/i.exec(text);
    const opening = /Start\s+Balance\s*([+-]?)\s*\$\s*([\d,]+\.\d{2})/i.exec(text);
    const closing = /End\s+Balance\s*([+-]?)\s*\$\s*([\d,]+\.\d{2})/i.exec(text);
    if (!period || !opening || !closing) return null;
    const start = namedDate(period[1]!, period[2]!, period[3]!), end = namedDate(period[4]!, period[5]!, period[6]!);
    return start && end && start <= end ? { start, end, opening: signed(opening[1], opening[2]!), closing: signed(closing[1], closing[2]!) } : null;
  }
  if (/CommBank|Commonwealth\s*Bank/i.test(text)) {
    const period = /(?:Period\s+)?(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})\s*[-–]\s*(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})/i.exec(text);
    const opening = /OPENING\s+BALANCE\s+([\d,]+\.\d{2})\s*(CR|DR)/i.exec(text);
    const closing = /Closing\s+Balance\s+([\d,]+\.\d{2})\s*(CR|DR)/i.exec(text);
    if (!period || !opening || !closing) return null;
    const start=namedDate(period[1]!,period[2]!,period[3]!), end=namedDate(period[4]!,period[5]!,period[6]!);
    return start && end && start <= end ? {start,end,opening:(opening[2]!.toUpperCase()==='DR'?'-':'')+opening[1]!.replaceAll(',',''),closing:(closing[2]!.toUpperCase()==='DR'?'-':'')+closing[1]!.replaceAll(',','')} : null;
  }
  if (!/Westpac\s+Choice/i.test(text)) return null;
  const period = /Statement\s+Period\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*[-–]\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})/i.exec(text);
  if (!period) return null;
  const start = namedDate(period[1]!, period[2]!, period[3]!), end = namedDate(period[4]!, period[5]!, period[6]!);
  const opening = /Opening\s+Balance\s*([+-]?)\s*\$\s*([\d,]+\.\d{2})/i.exec(text), closing = /Closing\s+Balance\s*([+-]?)\s*\$\s*([\d,]+\.\d{2})/i.exec(text);
  if (!start || !end || start > end || !opening || !closing) return null;
  return { start, end, opening: signed(opening[1], opening[2]!), closing: signed(closing[1], closing[2]!) };
}

/**
 * Whether the text is a payslip with the labelled fields the payslip parser reads. Ticking the box was
 * one more thing to know about a file the app had already read; the labels say what it is.
 */
export function looksLikePayslip(text: string): boolean {
  return /^(?:Employer|Company)\s*[:|]/im.test(text) && /^(?:Pay date|Payment date)\s*[:|]/im.test(text)
    && /^(?:Gross|Gross pay|Gross earnings)\s*[:|]/im.test(text) && /^(?:Net|Net pay|Net payment)\s*[:|]/im.test(text);
}

/**
 * The last four digits of the account number printed on the file, when a label names one, so the
 * account can be chosen the way a notification's is: by the tail the person already recorded.
 * Nothing is returned when no label is found — the address block and the ABN are also runs of digits.
 */
export function accountTail(text: string): string | null {
  const found = /Account(?:\s*\/\s*Card)?\s+(?:number|no\.?)\s*:?[\s\S]{0,80}?(\d[\d\s-]{5,}\d)/i.exec(text);
  if (!found) return null;
  const digits = found[1]!.replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-4) : null;
}

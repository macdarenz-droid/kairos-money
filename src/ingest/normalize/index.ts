import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { currencyDigits, money, parseDecimal, type Currency } from '../../core/money';
import { DateOutsidePeriod, ImportFailure, type ImportContext, type NormalizedRow, type Period, type RawRow } from '../types';
export function hash(value: string | Uint8Array): string { return bytesToHex(sha256(typeof value === 'string' ? new TextEncoder().encode(value) : value)); }
export function isoDay(input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(Date.parse(input)) || new Date(input).toISOString().slice(0, 10) !== input) throw new Error(`Invalid calendar date: ${input}.`);
  return input;
}
export function dayNumber(day: string): number { return Date.parse(isoDay(day)) / 86400000; }
export function shiftDay(day: string, days: number): string { return new Date((dayNumber(day) + days) * 86400000).toISOString().slice(0, 10); }
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function normalizeDate(value: string, period: Period, order: 'DMY' | 'MDY'): string {
  isoDay(period.start); isoDay(period.end);
  if (period.start > period.end) throw new Error('Statement end precedes its start.');
  const cleaned = value.trim(); let candidates: string[] = [];
  const years = (given: string | undefined) => given
    ? [Number(given.length === 2 ? `20${given}` : given)]
    : Array.from({ length: Number(period.end.slice(0, 4)) - Number(period.start.slice(0, 4)) + 1 }, (_, i) => Number(period.start.slice(0, 4)) + i);
  const build = (day: number, month: number, given: string | undefined) => years(given).flatMap(year => {
    const s = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    try { return [isoDay(s)]; } catch { return []; }
  });
  // A written month is the one date format that carries no ambiguity: "15 Sep 2026" and "Sep 15, 2026"
  // both mean the same day whichever way round the reader expects, so neither needs the DMY/MDY setting.
  // Accepting them here is what lets a statement printed with month names be read at all.
  const dayFirst = /^(\d{1,2})[\s.-]+([A-Za-z]{3,})\.?[\s.-]+(\d{2}|\d{4})$/.exec(cleaned);
  const monthFirst = /^([A-Za-z]{3,})\.?[\s.-]+(\d{1,2}),?[\s.-]+(\d{2}|\d{4})$/.exec(cleaned);
  const named = dayFirst ? { day: Number(dayFirst[1]), name: dayFirst[2]!, year: dayFirst[3] }
    : monthFirst ? { day: Number(monthFirst[2]), name: monthFirst[1]!, year: monthFirst[3] } : null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) candidates = [isoDay(cleaned)];
  else if (named) {
    const month = MONTH_NAMES.indexOf(named.name.slice(0, 3).toLowerCase());
    if (month < 0) throw new ImportFailure('Statement period is known.', 'The transaction date names a month that could not be read.', value, 'Use day/month/year or confirm the column mapping.');
    candidates = build(named.day, month + 1, named.year);
  }
  else {
    const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(cleaned);
    if (!m) throw new ImportFailure('Statement period is known.', 'The transaction date could not be read.', value, 'Use day/month/year or confirm the column mapping.');
    const month = Number(m[order === 'DMY' ? 2 : 1]), day = Number(m[order === 'DMY' ? 1 : 2]);
    candidates = build(day, month, m[3]);
  }
  // THREE OUTCOMES, NOT ONE. The window is what disambiguates a date like 03/04, so it has to be
  // applied — but failing it means three different things, and they had one message between them.
  const inside = candidates.filter(s => s >= period.start && s <= period.end);
  if (inside.length === 1) return inside[0]!;
  if (inside.length > 1) throw new ImportFailure('The statement period is known.', 'This date reads as two different days inside the statement period.', value, 'Set the date format to day/month or month/day.');
  // Read without doubt, just not inside the window. The remedy is the statement dates, so say so.
  if (candidates.length) throw new DateOutsidePeriod([...candidates].sort()[0]!, period);
  throw new ImportFailure('The statement period is known.', 'This date could not be read as a real day.', value, 'Confirm the date format and the column mapping.');
}

/**
 * The first and last date a column actually contains, read against a deliberately wide window.
 *
 * Used only to tell somebody what to type when their statement period is too narrow. The wide window
 * means a two-digit year can read as several years at once and this gives up rather than guess — an
 * offer of the wrong dates is worse than no offer.
 */
export function dateSpan(values: readonly string[], period: Period, order: 'DMY' | 'MDY'): Period | null {
  if (!values.length) return null;
  const wide = { start: `${Number(period.start.slice(0, 4)) - 2}-01-01`, end: `${Number(period.end.slice(0, 4)) + 2}-12-31` };
  const days: string[] = [];
  for (const value of values) {
    try { days.push(normalizeDate(value, wide, order)); } catch { return null; }
  }
  const sorted = [...days].sort();
  return { start: sorted[0]!, end: sorted.at(-1)! };
}
export function normalizeAmount(value: string, code: Currency, decimal: '.' | ','): bigint {
  let s = value.trim().toUpperCase();
  const negative = /^\(.*\)$/.test(s) || /DR$/.test(s) || /-$/.test(s) || /^-/.test(s);
  if (/CR$/.test(s) && negative) throw new Error(`Conflicting amount signs: ${value}. Confirm the amount.`);
  // A currency marker can sit on either side of the figure: "PHP 1,200.00" and "1,200.00 PHP" are both
  // ordinary export formats. Only the leading one was stripped, so the trailing form failed with an
  // unreadable-fraction error — loud rather than wrong, but it still refused a perfectly good file.
  // Uppercasing above means Php, php and PHP all arrive here as one spelling.
  const MARKER = /AUD|USD|PHP|EUR|GBP|NZD|CAD|SGD|JPY|KWD|A\$|\$|£|€|₱/.source;
  s = s.replace(/(?:DR|CR)$/, '').replace(/[()]/g, '').replace(/^-|-$|^\+/, '').trim()
    .replace(new RegExp(`^(?:${MARKER})\\s*`), '')
    .replace(new RegExp(`\\s*(?:${MARKER})$`), '')
    .trim();
  const grouping = decimal === '.' ? ',' : '.';
  const parts = s.split(decimal);
  if (parts.length > 2 || (parts[1]?.length ?? 0) > currencyDigits[code]) throw new Error(`The decimal format in “${value}” is unclear. Confirm the decimal separator.`);
  const whole = parts[0] ?? '';
  const groupPattern = grouping === ',' ? /^\d{1,3}(,\d{3})+$/ : /^\d{1,3}(\.\d{3})+$/;
  if (!/^\d+$/.test(whole) && !groupPattern.test(whole)) throw new Error(`The amount “${value}” has invalid digit grouping. Correct this amount.`);
  if (parts[1] !== undefined && !/^\d+$/.test(parts[1])) throw new Error(`The amount “${value}” has an unreadable fraction. Correct this amount.`);
  const parsed = parseDecimal(`${negative ? '-' : ''}${whole.split(grouping).join('')}${parts[1] === undefined ? '' : '.' + parts[1]}`, code);
  return parsed.minor;
}
export function merchantName(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/\b(?:EFTPOS|POS|VISA|MASTERCARD|DEBIT CARD|CREDIT CARD)\b/g, ' ').replace(/\b(?:TERMINAL|STORE|REF|REFERENCE|AUTH|TID)\s*[#:]?\s*[A-Z0-9-]+\b/g, ' ').replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, ' ').replace(/\b\d{5,}\b/g, ' ').replace(/\s+(?:MELBOURNE|SYDNEY|BRISBANE|PERTH|ADELAIDE)(?:\s+(?:VIC|NSW|QLD|WA|SA))?$/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function similarity(a: string, b: string): number {
  if (a === b) return 10000;
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 2) }, (_, i) => s.slice(i, i + 3)));
  const x = grams(a), y = grams(b); if (!x.size || !y.size) return 0;
  return Math.floor(20000 * [...x].filter(g => y.has(g)).length / (x.size + y.size));
}
export function canonicalMerchant(raw: string, aliases: readonly { canonical: string; aliases: string[] }[]): string {
  const name = merchantName(raw);
  const ranked = aliases.map(a => ({ name: a.canonical, score: Math.max(...[a.canonical, ...a.aliases].map(v => similarity(name, merchantName(v)))) })).filter(a => a.score >= 8600).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked[0] && (!ranked[1] || ranked[0].score > ranked[1].score) ? ranked[0].name : name;
}
export function rowFingerprint(row: Pick<NormalizedRow, 'accountId' | 'date' | 'minor' | 'merchant' | 'occurrence'>): string { return hash(JSON.stringify([row.accountId, row.date, row.minor, row.merchant.slice(0, 120), row.occurrence])); }
export function normalizeRow(raw: RawRow, context: ImportContext, aliases: readonly { canonical: string; aliases: string[] }[] = []): NormalizedRow {
  let minor = normalizeAmount(raw.amount, context.currency, context.decimal);
  if (raw.direction) minor = (minor < 0n ? -minor : minor) * (raw.direction === 'debit' ? -1n : 1n);
  else if (/(?:DR|CR)\s*$/i.test(raw.amount)) { /* Explicit debit/credit suffix already supplies ledger direction. */ }
  else if (context.accountKind === 'credit' && context.creditPositivePurchases) minor = -minor;
  money(minor, context.currency);
  const merchant = canonicalMerchant(raw.description, aliases);
  const row: NormalizedRow = { sourceId: raw.sourceId, accountId: context.accountId, date: normalizeDate(raw.date, context.period, context.dateOrder), description: raw.description.trim(), merchant, minor: minor.toString(), currency: context.currency, reference: raw.reference ?? '', pending: raw.pending ?? false, status: raw.pending ? 'pending' : 'settled', ...(raw.runningBalance === undefined ? {} : { runningBalance: normalizeAmount(raw.runningBalance, context.currency, context.decimal).toString() }), confidence: raw.confidence, fingerprint: '', issues: [], category: null, verified: false, duplicateOf: null, occurrence: '', createRule: false, mcc: raw.mcc ?? null };
  if (!row.description || !merchant) row.issues.push('Confirm the merchant description.');
  if (row.pending) row.issues.push('This transaction is pending. Confirm it against a settled statement.');
  if (raw.confidence < 9000) row.issues.push('Check this extracted row against the source.');
  row.fingerprint = rowFingerprint(row); return row;
}

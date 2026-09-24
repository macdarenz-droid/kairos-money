export const currencyDigits = { AUD: 2, USD: 2, PHP: 2, EUR: 2, GBP: 2, NZD: 2, CAD: 2, SGD: 2, JPY: 0, KWD: 3 } as const;
export type Currency = keyof typeof currencyDigits;
export type Money = Readonly<{ minor: bigint; currency: Currency }>;
const limit = 9007199254740991n;
const formatters = new Map<string, Intl.NumberFormat>();

export function currency(value: string): Currency {
  if (!Object.hasOwn(currencyDigits, value)) throw new Error(`Unsupported currency: ${value}`);
  return value as Currency;
}
export function money(minor: bigint, code: Currency): Money {
  if (typeof minor !== 'bigint') throw new TypeError('Money requires integer minor units as bigint.');
  currency(code);
  if (minor < -limit || minor > limit) throw new RangeError('Amount exceeds the exact database range.');
  return Object.freeze({ minor, currency: code });
}
function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new Error('Convert currencies explicitly before combining money.');
}
export function add(a: Money, b: Money): Money { sameCurrency(a, b); return money(a.minor + b.minor, a.currency); }
export function subtract(a: Money, b: Money): Money { sameCurrency(a, b); return money(a.minor - b.minor, a.currency); }
export function allocate(value: Money, weights: readonly bigint[]): Money[] {
  if (!weights.length || weights.some(w => w < 0n)) throw new Error('Allocation needs non-negative integer weights.');
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) throw new Error('Allocation needs a positive total weight.');
  const sign = value.minor < 0n ? -1n : 1n;
  const absolute = value.minor * sign;
  const shares = weights.map(w => (absolute * w) / total);
  let remainder = absolute - shares.reduce((a, b) => a + b, 0n);
  for (let i = 0; remainder > 0n; i++) {
    if (weights[i] !== 0n) { shares[i] = (shares[i] ?? 0n) + 1n; remainder -= 1n; }
  }
  return shares.map(v => money(v * sign, value.currency));
}
export function parseDecimal(input: string, code: Currency): Money {
  const digits = currencyDigits[code];
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match || (match[3]?.length ?? 0) > digits) throw new Error(`Enter an amount with at most ${digits} decimal places.`);
  const unit = 10n ** BigInt(digits);
  const minor = BigInt(match[2] ?? '0') * unit + BigInt((match[3] ?? '').padEnd(digits, '0') || '0');
  return money(match[1] ? -minor : minor, code);
}
export function format(value: Money, locale = 'en-AU'): string {
  const digits = currencyDigits[value.currency];
  const key = JSON.stringify([locale, value.currency]);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    // Formatting configuration is reusable; amounts and their rendered strings are not cached.
    if (formatters.size >= 32) formatters.delete(formatters.keys().next().value!);
    formatters.set(key, formatter);
  }
  const unit = 10n ** BigInt(digits);
  const negative = value.minor < 0n;
  const absolute = negative ? -value.minor : value.minor;
  const whole = absolute / unit;
  const fraction = (absolute % unit).toString().padStart(digits, '0');
  const signed = negative ? (whole === 0n ? -1n : -whole) : whole;
  return formatter.formatToParts(signed).map(part => part.type === 'fraction' ? fraction : part.type === 'integer' && whole === 0n ? '0' : part.value).join('');
}
export function toDatabase(value: Money): number { return Number(money(value.minor, value.currency).minor); }
export function fromDatabase(value: unknown, code: Currency): Money {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Database amount is not an exact integer.');
  return money(BigInt(value), code);
}
export function serialize(value: Money): { minor: string; currency: Currency } { return { minor: value.minor.toString(), currency: value.currency }; }

/** "1.2e-3" as "0.0012": the exponent moves the point by characters, so no float ever holds the value. */
export function expandDecimal(value: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?[Ee]([+-]?\d+)$/.exec(value); if (!m) return value;
  const exponent = Number(m[4]); if (Math.abs(exponent) > 30) throw new Error('A number is outside the supported range.');
  const digits = m[2]! + (m[3] ?? ''), point = m[2]!.length + exponent;
  return m[1]! + (point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point));
}

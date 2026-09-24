import {format, money} from '../../core/money';

/** Micro-dollars as US dollars, rounded up to the cent so a cost is never understated. */
export function usd(micros: bigint | string): string {
  const cents = (BigInt(micros) + 9999n) / 10000n;
  return format(money(cents, 'USD'));
}

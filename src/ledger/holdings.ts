import {convert, rateBetween, type Rate} from '../core/fx';
import {currency, money, type Currency} from '../core/money';

/**
 * What is held, split the one way that matters: spendable, and kept in savings or investment accounts.
 * Each balance converts at `asOf`'s rate; an account no rate reaches is left out, never counted as zero.
 */
export function holdingsFrom(accounts: readonly {id: string; type?: string; currency: string; archived_at?: string | null}[],
  balances: readonly {accountId: string; minor: string}[], rates: readonly Rate[], code: Currency, asOf: string) {
  let spendable = 0n, saved = 0n;
  for (const a of accounts) {
    if (a.archived_at) continue;
    const held = currency(a.currency), rate = rateBetween(rates, held, code, asOf);
    if (rate === null) continue;
    const value = convert(money(BigInt(balances.find(b => b.accountId === a.id)?.minor ?? '0'), held), code, rate).minor;
    if (a.type === 'savings' || a.type === 'investment') saved += value; else spendable += value;
  }
  return {spendableMinor: spendable.toString(), savedMinor: saved.toString()};
}

import { currency, money, toDatabase } from '../core/money';
import { openingBalance } from './integrity';
import type { Driver } from '../core/db/driver';
import type { Document } from './types';

/**
 * THE BALANCE AN ACCOUNT STARTS FROM, TAKEN FROM THE EARLIEST STATEMENT THAT CAN PROVE IT.
 *
 * "if i setup 0 acct, and i import latest txn file. then i would see my balance up to date on what i
 * imported on latest date. if i import older dates, it will sync and do the math to match my latest
 * acct balance."
 *
 * The Ledger shows opening balance plus every movement recorded against the account. Opened at zero,
 * that prints the SUM OF THE MOVEMENTS — true, and not the number he was looking for. His statement
 * ends at $190.21 and its movements come to -$78.27, so the account held $268.48 before its first row.
 *
 * Anchoring on the EARLIEST statement rather than the latest is what makes importing an older file
 * safe: the older file's opening replaces this one's, and its movements are added, so the sum
 * telescopes and the latest balance does not move. Anchoring on the latest would count the older
 * file's rows twice.
 *
 * Two kinds of statement can say what came before them, and they are the two the integrity tiers
 * already name. A balance-verified one (tier A) declares its own opening figure and commit refuses it
 * unless that figure plus its rows reach its closing figure. A running-balance-verified one (tier B)
 * carries the bank's balance beside every row, and one row's balance less that row's own amount is the
 * balance immediately before it. Tier C is neither, so it is never an anchor: its header figures are
 * whatever the parser could make of the page. It is a recomputation over every committed
 * statement, not an increment, so rolling one back re-derives from whatever is left and removing the
 * last of them puts back the figure that was typed in when the account was created.
 *
 * A figure the person types in by hand afterwards wins. It is their account and their money; if the
 * balance no longer matches what was last anchored, that is a deliberate correction, and overwriting
 * it on the next import would be the app arguing with its owner.
 */
type Anchor = { batchId: string; date: string; typedMinor: string; appliedMinor: string };
const settingKey = (accountId: string) => 'opening-anchor:' + accountId;
const firstDay = (doc: Document) => doc.rows.reduce((earliest, row) => (row.date < earliest ? row.date : earliest), doc.rows[0]!.date);

export async function reanchorOpening(driver: Driver, accountId: string, committed: readonly Document[]): Promise<void> {
  const account = (await driver.query('SELECT currency, opening_balance_minor FROM accounts WHERE id=?', [accountId]))[0];
  if (!account) return;
  const code = currency(String(account.currency));
  const held = String(account.opening_balance_minor ?? '0');
  const stored = (await driver.query('SELECT value FROM app_settings WHERE key=?', [settingKey(accountId)]))[0];
  const anchor = stored ? (JSON.parse(String(stored.value)) as Anchor) : null;
  if (anchor && anchor.appliedMinor !== held) { await driver.execute('DELETE FROM app_settings WHERE key=?', [settingKey(accountId)]); return; }
  const typedMinor = anchor ? anchor.typedMinor : held;

  const chosen = committed
    .filter(doc => doc.context.accountId === accountId && !doc.payslip && doc.integrityTier !== 'C' && doc.rows.length > 0)
    .map(doc => ({ doc, day: firstDay(doc), opening: openingBalance(doc) ?? (doc.integrityTier === 'A' ? BigInt(doc.opening) : null) }))
    .filter((candidate): candidate is { doc: Document; day: string; opening: bigint } => candidate.opening !== null)
    // Earliest statement wins; its id breaks a tie so two files covering the same first day never flip.
    .sort((a, b) => (a.day === b.day ? (a.doc.id < b.doc.id ? -1 : 1) : a.day < b.day ? -1 : 1))[0];

  if (!chosen) {
    if (!anchor) return;
    await driver.execute('UPDATE accounts SET opening_balance_minor=? WHERE id=?', [toDatabase(money(BigInt(typedMinor), code)), accountId]);
    await driver.execute('DELETE FROM app_settings WHERE key=?', [settingKey(accountId)]);
    return;
  }
  const applied = toDatabase(money(chosen.opening, code));
  await driver.execute('UPDATE accounts SET opening_balance_minor=? WHERE id=?', [applied, accountId]);
  await driver.execute('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [settingKey(accountId), JSON.stringify({ batchId: chosen.doc.id, date: chosen.day, typedMinor, appliedMinor: String(applied) } satisfies Anchor)]);
}

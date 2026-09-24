import {Capacitor, registerPlugin} from '@capacitor/core';
import {currency} from '../../core/money';
import {expenseCategories} from '../../ledger/categories';
import type {ManualInput} from '../../ledger/manual';
import {normalizeAmount} from '../normalize';
import {localDay} from '../reminders';

/** One thing typed into the home-screen sheet, exactly as typed: the amount is the decimal string. */
export type QuickAddEntry = {id: string; amount: string; direction: 'spent' | 'received'; category: string | null; currency: string; accountId: string; at: number};
/** What the sheet needs to know without the ledger: where money lands, and the categories to offer. */
export type QuickAddConfig = {accountId: string; accountName: string; currency: string; categories: string[]};

const QuickAdd = registerPlugin<{
  configure(config: QuickAddConfig): Promise<void>;
  pending(): Promise<{entries: QuickAddEntry[]}>;
  clear(options: {ids: string[]}): Promise<void>;
}>('KairosQuickAdd');

/** The six chips the sheet offers, and the first four the widget shows. Everyday spending, by frequency. */
export const WIDGET_CATEGORIES: readonly string[] = ['Groceries', 'Coffee & snacks', 'Transport', 'Eating out', 'Shopping', 'Entertainment'];

/**
 * THE OUTBOX, FROM THE WEB LAYER'S SIDE. "Once i click add txn, it opens the app. That should not be
 * the case." The sheet the widget opens lives outside the app and cannot reach the encrypted ledger, so
 * it writes to a private store on the phone; this is the side that empties it, the moment the app is
 * unlocked, into hand-recorded transactions.
 *
 * Off the phone there is no widget, so every call is a quiet no rather than an error.
 */
export const quickAddAvailable = () => Capacitor.isNativePlatform();
async function ask<T>(call: () => Promise<T>, whenAbsent: T): Promise<T> {
  if (!quickAddAvailable()) return whenAbsent;
  try { return await call(); } catch { return whenAbsent; }
}
export const configureQuickAdd = (config: QuickAddConfig): Promise<void> => ask(() => QuickAdd.configure(config), undefined);
export const pendingQuickAdds = (): Promise<QuickAddEntry[]> => ask(async () => (await QuickAdd.pending()).entries, []);
export async function clearQuickAdds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  // Failing to clear must be loud: an entry left behind is recorded twice on the next open.
  if (quickAddAvailable()) await QuickAdd.clear({ids});
}

/**
 * The hand-recorded transaction an outbox entry was typed as. The amount becomes minor units here, in
 * the account's own currency: the one place that arithmetic happens. A category is kept only when it is
 * one the ledger knows and the money went out; money in has no expense category.
 */
export function manualFromQuickAdd(entry: QuickAddEntry, account: {id: string; currency: string}): ManualInput {
  const code = currency(account.currency);
  const minor = normalizeAmount(entry.amount, code, '.');
  if (minor <= 0n) throw new Error('A quick add needs an amount above zero.');
  const income = entry.direction === 'received';
  const category = !income && entry.category && expenseCategories.includes(entry.category) ? entry.category : null;
  return {
    id: `quick-${entry.id}`, kind: income ? 'income' : 'expense', accountId: account.id, destinationId: null,
    date: localDay(new Date(entry.at)), minor: minor.toString(),
    description: category ?? (income ? 'Money in' : 'Purchase'), category, notes: 'Added from the home-screen widget.',
  };
}

/**
 * Which account an entry lands in: the one the sheet was set to, if it is still open; otherwise the
 * main account, or the first, provided it holds the same currency the amount was typed in. An entry
 * that fits nowhere stays in the outbox rather than being recorded in the wrong money.
 */
export function accountForQuickAdd<A extends {id: string; currency: string; archived_at: string | null}>(entry: QuickAddEntry, accounts: readonly A[], primaryId: string | null): A | null {
  const open = accounts.filter(a => a.archived_at === null);
  return open.find(a => a.id === entry.accountId && a.currency === entry.currency)
    ?? [...open.filter(a => a.id === primaryId), ...open].find(a => a.currency === entry.currency)
    ?? null;
}

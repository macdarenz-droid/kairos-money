import type {Driver} from '../core/db/driver';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';

/**
 * WHAT A CATEGORY COUNTS AS, for every screen that turns spending into a signal.
 *
 * Eleven categories meant most purchases had nowhere honest to go, so they piled up as Uncategorised —
 * not because the app could not tell what a coffee or a phone bill was, but because it had never been
 * taught the word for it. This is not built from one ledger's transactions; a taxonomy that only knew
 * what one person had bought would fail the next person on their first import. It is the ordinary shape
 * of a household's spending, named the way any daily user would recognise it, and it is the one list —
 * every place that used to guess a category's kind from its name now asks this instead.
 */
export type CategoryKind = 'essential' | 'discretionary' | 'income' | 'savings' | 'debt' | 'transfer';

const TABLE: readonly (readonly [string, Exclude<CategoryKind, 'transfer'>])[] = [
  // Essential: the spending that keeps a household running, not a choice made fresh each time.
  ['Groceries', 'essential'],
  ['Housing', 'essential'],
  ['Utilities', 'essential'],
  ['Insurance', 'essential'],
  ['Health', 'essential'],
  ['Childcare & education', 'essential'],
  ['Transport', 'essential'],
  ['Government & tax', 'essential'],

  // Discretionary: chosen spending, the largest and most varied group by far.
  ['Eating out', 'discretionary'],
  ['Coffee & snacks', 'discretionary'],
  ['Shopping', 'discretionary'],
  ['Clothing & accessories', 'discretionary'],
  ['Electronics', 'discretionary'],
  ['Entertainment', 'discretionary'],
  ['Subscriptions', 'discretionary'],
  ['Fitness & wellbeing', 'discretionary'],
  ['Personal care', 'discretionary'],
  ['Travel', 'discretionary'],
  ['Alcohol & tobacco', 'discretionary'],
  ['Pets', 'discretionary'],
  ['Home & garden', 'discretionary'],
  ['Gifts & donations', 'discretionary'],
  ['Hobbies & media', 'discretionary'],
  ['Cash withdrawal', 'discretionary'],
  ['Bank fees', 'discretionary'],
  ['Software & apps', 'discretionary'],
  ['Professional services', 'discretionary'],

  // Income: money arriving, split by where it came from rather than lumped into one word. 'Income'
  // itself stays: real ledgers and restored backups already hold rows filed under exactly that name,
  // and the newer, more specific names beside it are an addition, not a replacement for it.
  ['Income', 'income'],
  ['Salary', 'income'],
  ['Government payment', 'income'],
  ['Interest & investment income', 'income'],
  ['Refund', 'income'],
  ['Other income', 'income'],

  // Money kept rather than spent, and money owed.
  ['Savings', 'savings'],
  ['Investing', 'savings'],
  ['Debt repayment', 'debt'],
];

const KIND_BY_NAME = new Map<string, CategoryKind>(TABLE.map(([name, kind]) => [name, kind]));

/** Every category a person can choose for themselves. Transfer is not here: it is decided by matching two
 * of the owner's own accounts, never picked, so offering it beside these would invite a false one. */
export const editableCategories: readonly string[] = TABLE.map(([name]) => name);

/** The same list, plus Transfer, for the one screen that reviews a row before it is a transfer or not:
 * confirming an import, where that judgement has not been made yet. */
export const categoryNames: readonly string[] = [...editableCategories, 'Transfer'];

/** What an expense can be filed under, by hand. Income categories describe money arriving, not leaving,
 * and the manual entry form already asks separately whether this is income — offering 'Salary' as a
 * choice for a purchase would be a category that cannot be true. */
export const expenseCategories: readonly string[] = editableCategories.filter(name => categoryKind(name) !== 'income');

/**
 * The kind a category's name stands for, for the three places that write one to the database.
 *
 * This used to be a ternary repeated at each of those call sites, each one a separate chance to fall out
 * of step with the others as the list grew — 'Housing' meant essential in one file and, because a fourth
 * file never learned the word, fell through to discretionary in another. One table now, asked instead of
 * re-derived; an unrecognised name is discretionary, the same default every version already agreed on.
 */
export function categoryKind(name: string): CategoryKind {
  return name === 'Transfer' ? 'transfer' : KIND_BY_NAME.get(name) ?? 'discretionary';
}

type Edit = {id: string; category: string | null};
const categoryId = (name: string) => bytesToHex(sha256('category:' + name));
async function apply(driver: Driver, edit: Edit) {
  const row = (await driver.query('SELECT id,transfer_group_id FROM transactions WHERE id=?', [edit.id]))[0];
  if (!row || row.transfer_group_id) return;
  const name = edit.category, id = name ? categoryId(name) : null;
  if (name) await driver.execute('INSERT OR IGNORE INTO categories(id,name,kind) VALUES(?,?,?)', [id, name, categoryKind(name)]);
  await driver.execute('UPDATE transactions SET category_id=? WHERE id=?', [id, edit.id]);
}
/** User presentation edits are replayed after rebuilding original statement contributions. */
export async function applyCategoryEdits(driver: Driver) {
  for (const row of await driver.query("SELECT value FROM app_settings WHERE key LIKE 'category-edit:%' ORDER BY key")) await apply(driver, JSON.parse(String(row.value)) as Edit);
}
export function categoryRepository(driver: Driver) {
  async function set(ids: string[], category: string | null) {
    const unique = [...new Set(ids)]; if (!unique.length || unique.length > 1000) throw new Error('Choose between one and 1,000 transactions.');
    if (category !== null && !editableCategories.some(c => c === category)) throw new Error('Choose a supported category.');
    return driver.transaction(async () => {
      for (const id of unique) {
        const row = (await driver.query('SELECT id,transfer_group_id FROM transactions WHERE id=?', [id]))[0]; if (!row) throw new Error('A selected transaction was removed. Refresh the ledger and select it again.'); if (row.transfer_group_id) throw new Error('Matched transfers keep their transfer classification. Remove them from this selection.');
        if ((await driver.query('SELECT key FROM app_settings WHERE key=?', ['split:' + id])).length) throw new Error('Remove this transaction’s category split before assigning a single category.');
        const sources = await driver.query("SELECT s.transaction_id FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.transaction_id=? AND b.parser_version!='manual-entry-v1'", [id]); if (!sources.length) throw new Error('Edit manual entries from their transaction form.');
      }
      for (const id of unique) { const edit = {id, category}; await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)', ['category-edit:' + id, JSON.stringify(edit)]); await apply(driver, edit); }
    });
  }
  return {set};
}

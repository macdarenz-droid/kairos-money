import type {Driver} from '../core/db/driver';
import {currencyDigits, type Currency} from '../core/money';
import {bytesToHex, randomBytes} from '@noble/hashes/utils';
import type {LedgerRow} from '../ingest/types';
import {editableCategories} from './categories';

export type Confidence = 'high' | 'medium' | 'low';
/** Stored under `ai-category:<merchantKey>` for high and medium answers; `run` is the run that wrote it. */
export type AiCategory = {category: string; confidence: Confidence; model: string; at: string; run: string};
export type Answer = {key: string; category: string; confidence: Confidence};
export type AiRun = {id: string; at: string; model: string; previous: Record<string, AiCategory | null>; applied: string[]; proposals: {key: string; category: string}[]};

export type PayloadMerchant = {id: string; description: string; direction: 'in' | 'out' | 'both'; band: string; count: number; mcc: string | null; category: string | null};
/** `sent` is the only part that leaves the device; `keys` maps its opaque ids back to merchant keys. */
export type Payload = {sent: {merchants: PayloadMerchant[]; examples: {description: string; category: string}[]}; keys: Record<string, string>};

const PREFIX = 'ai-category:';
const RUN = 'ai-run:';
const mask = (text: string) => text.replace(/\d{4,}/g, '####').replace(/\s+/g, ' ').trim().slice(0, 120);
const BANDS: readonly [bigint, string][] = [[10n, 'under 10'], [50n, '10–50'], [200n, '50–200'], [1000n, '200–1000']];

function band(minor: bigint, code: Currency): string {
  const unit = 10n ** BigInt(currencyDigits[code]);
  return BANDS.find(([limit]) => minor < limit * unit)?.[1] ?? 'over 1000';
}
/** Ties go to the first in sort order, so the result never depends on row order. */
function mostCommon<T extends string>(values: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}
function median(values: bigint[]): bigint {
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2n;
}

/**
 * What Claude is shown to sort categories (`sent`): one entry per merchant key, with an opaque id.
 * No dates, exact amounts, accounts, transfers or split rows; digit runs of 4+ are masked.
 * The amount band uses the merchant's most common currency only.
 */
export function categorisationPayload(rows: readonly LedgerRow[], options: {splitIds: ReadonlySet<string>; examples: readonly {description: string; category: string}[]}): Payload {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    if (row.transferGroup || row.category === 'Transfer' || options.splitIds.has(row.id) || !row.merchant) continue;
    const list = groups.get(row.merchant) ?? [];
    list.push(row); groups.set(row.merchant, list);
  }
  const merchants: PayloadMerchant[] = [], keys: Record<string, string> = {};
  for (const [key, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `m${merchants.length + 1}`;
    keys[id] = key;
    const description = mostCommon(list.map(row => row.description)), currency = mostCommon(list.map(row => row.currency));
    const inward = list.some(row => BigInt(row.minor) > 0n), outward = list.some(row => BigInt(row.minor) < 0n);
    const amounts = list.filter(row => row.currency === currency).map(row => BigInt(row.minor) < 0n ? -BigInt(row.minor) : BigInt(row.minor));
    const categories = new Set(list.map(row => row.category));
    merchants.push({id, description: mask(description), direction: inward && outward ? 'both' : inward ? 'in' : 'out',
      band: band(median(amounts), currency), count: list.length, mcc: list.find(row => row.mcc)?.mcc ?? null,
      category: categories.size === 1 ? [...categories][0] ?? null : null});
  }
  return {sent: {merchants, examples: options.examples.slice(0, 40).map(e => ({description: mask(e.description), category: e.category}))}, keys};
}

/** Claude's stored categories by merchant key, as categorize() reads them. */
export async function aiCategories(driver: Driver): Promise<Record<string, string>> {
  // A key range rather than LIKE, so the primary-key index serves it.
  const rows = await driver.query("SELECT key,value FROM app_settings WHERE key>='ai-category:' AND key<'ai-category;'");
  return Object.fromEntries(rows.map(row => [String(row.key).slice(PREFIX.length), (JSON.parse(String(row.value)) as AiCategory).category]));
}

/** @param refresh re-derives every imported row's category, inside the caller's transaction */
export function aiCategoryRepository(driver: Driver, refresh: () => Promise<void>) {
  const read = async (key: string) => {
    const row = (await driver.query('SELECT value FROM app_settings WHERE key=?', [PREFIX + key]))[0];
    return row ? JSON.parse(String(row.value)) as AiCategory : null;
  };
  const write = (key: string, value: AiCategory | null) => value
    ? driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)', [PREFIX + key, JSON.stringify(value)])
    : driver.execute('DELETE FROM app_settings WHERE key=?', [PREFIX + key]);

  /** Stores high and medium answers as one undoable run; low ones come back as proposals. Unknown keys and categories are dropped. */
  async function applyRun(answers: readonly Answer[], model: string, at = new Date().toISOString()): Promise<AiRun> {
    return driver.transaction(async () => {
      const known = new Set((await driver.query('SELECT canonical_name FROM merchants')).map(row => String(row.canonical_name)));
      const run: AiRun = {id: bytesToHex(randomBytes(12)), at, model, previous: {}, applied: [], proposals: []};
      const seen = new Set<string>();
      for (const answer of answers) {
        if (seen.has(answer.key) || !known.has(answer.key) || !editableCategories.includes(answer.category) || !['high', 'medium', 'low'].includes(answer.confidence)) continue;
        seen.add(answer.key);
        if (answer.confidence === 'low') { run.proposals.push({key: answer.key, category: answer.category}); continue; }
        run.previous[answer.key] = await read(answer.key);
        await write(answer.key, {category: answer.category, confidence: answer.confidence, model, at, run: run.id});
        run.applied.push(answer.key);
      }
      await driver.execute('INSERT INTO app_settings(key,value) VALUES(?,?)', [RUN + run.id, JSON.stringify(run)]);
      if (run.applied.length) await refresh();
      return run;
    });
  }
  /** Puts every merchant the run touched back exactly as it was. Refuses while a newer run still covers one of them. */
  async function undoRun(id: string) {
    return driver.transaction(async () => {
      const row = (await driver.query('SELECT value FROM app_settings WHERE key=?', [RUN + id]))[0];
      if (!row) throw new Error('That sorting run was already undone.');
      const run = JSON.parse(String(row.value)) as AiRun;
      // Restoring under a newer run would drop its answer and later bring this run's back.
      for (const key of Object.keys(run.previous)) if ((await read(key))?.run !== id) throw new Error('A newer sorting run changed these merchants. Undo that one first.');
      for (const [key, value] of Object.entries(run.previous)) await write(key, value);
      await driver.execute('DELETE FROM app_settings WHERE key=?', [RUN + id]);
      await refresh();
    });
  }
  async function runs(): Promise<AiRun[]> {
    return (await driver.query(`SELECT value FROM app_settings WHERE key LIKE '${RUN}%'`)).map(row => JSON.parse(String(row.value)) as AiRun).sort((a, b) => b.at.localeCompare(a.at));
  }
  return {applyRun, undoRun, runs, read};
}

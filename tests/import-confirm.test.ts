import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD',
  period: {start: '2026-01-01', end: '2026-01-31'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};

async function ledger() {
  const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Synthetic', institution: 'Synthetic bank', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  return repo;
}

/** Rows that are byte-for-byte the same purchase description, amount and day — the repeat-buy case. */
function file(name: string, rows: {date: string; amount: string; description: string}[]): Document {
  return {id: hash(JSON.stringify(['a', hash(name)])), hash: hash(name), fileName: name, parser: 'synthetic',
    context, opening: '0', closing: String(rows.reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0)),
    payslip: null, sourceRank: 3, sourceKind: 'export', integrityTier: 'C',
    rows: rows.map((r, i) => ({...normalizeRow({sourceId: String(i), confidence: 9800, ...r}, context), issues: [], verified: false}))};
}

const twice = (date: string) => ([
  {date, amount: '-11.95', description: 'Synthetic fuel stop'},
  {date, amount: '-11.95', description: 'Synthetic fuel stop'},
]);

describe('confirming an import that has look-alike rows', () => {
  /**
   * "when i click confirm, nothing happens." It was disabled, because rows the app is unsure about have
   * to be settled first — and a statement full of the same purchase on the same day is that, many times
   * over, each asking the identical question in its own sheet.
   */
  it('settles every look-alike inside the file in one decision', async () => {
    const repo = await ledger();
    const doc = file('repeats.csv', [...twice('2026-01-02'), ...twice('2026-01-05')]);
    await repo.imports.stage(doc);
    expect((await repo.imports.review(doc.id)).uncertainCount).toBeGreaterThan(0);

    const settled = await repo.imports.keepSeparate(doc.id);
    expect(settled).toBeGreaterThan(0);
    expect((await repo.imports.review(doc.id)).uncertainCount).toBe(0);

    // And the confirm that was refusing now goes through, with every row kept.
    const result = await repo.imports.commit(doc.id);
    expect(result.added).toBe(4);
    expect(await repo.accountBalances()).toEqual([{accountId: 'a', minor: '-4780'}]);
  });

  /**
   * THE CASE IT MUST NOT TOUCH, and the reason the one-press decision is safe.
   *
   * Once a purchase is in the ledger, a look-alike arriving in a later file is no longer the harmless
   * "I bought the same coffee twice" question — saying both are real is how the same money gets counted
   * twice. So a row whose look-alikes include something from ANOTHER batch is skipped, stays uncertain,
   * and the confirm keeps refusing until somebody has looked at it.
   */
  it('refuses to settle a row that looks like one already in the ledger', async () => {
    const repo = await ledger();
    const rows = [...twice('2026-01-02')];
    const first = file('january.csv', rows);
    await repo.imports.stage(first);
    await repo.imports.keepSeparate(first.id);
    expect((await repo.imports.commit(first.id)).added).toBe(2);
    const balance = await repo.accountBalances();

    const again = file('january-again.csv', rows);
    await repo.imports.stage(again);
    const overlapping = (await repo.imports.review(again.id)).items
      .filter(i => i.blocked && i.near.some(r => r.sources.some(source => source.batchId !== again.id)));
    expect(overlapping.length).toBeGreaterThan(0);

    expect(await repo.imports.keepSeparate(again.id)).toBe(0);
    const after = await repo.imports.review(again.id);
    for (const item of overlapping) expect(after.items.find(i => i.row.sourceId === item.row.sourceId)?.blocked).toBe(true);
    await expect(repo.imports.commit(again.id)).rejects.toThrow();
    expect(await repo.accountBalances()).toEqual(balance);
  });

  /** It settles look-alikes and nothing else: a row blocked for another reason is left as it was. */
  it('touches only rows that look like another row', async () => {
    const repo = await ledger();
    const doc = file('mixed.csv', [...twice('2026-01-02'),
      {date: '2026-01-09', amount: '-4.20', description: 'Synthetic cafe'}]);
    await repo.imports.stage(doc);
    const before = await repo.imports.review(doc.id);
    const settled = await repo.imports.keepSeparate(doc.id);
    expect(settled).toBe(before.items.filter(i => i.blocked && (i.collision || i.near.length > 0)).length);
  });

  it('has nothing to settle when no row looks like another', async () => {
    const repo = await ledger();
    const doc = file('plain.csv', [
      {date: '2026-01-02', amount: '-11.95', description: 'Synthetic fuel stop'},
      {date: '2026-01-03', amount: '-4.20', description: 'Synthetic cafe'},
    ]);
    await repo.imports.stage(doc);
    expect(await repo.imports.keepSeparate(doc.id)).toBe(0);
  });

  it('refuses to touch a batch that is already committed', async () => {
    const repo = await ledger();
    const doc = file('done.csv', [{date: '2026-01-02', amount: '-11.95', description: 'Synthetic fuel stop'}]);
    await repo.imports.stage(doc);
    await repo.imports.commit(doc.id);
    await expect(repo.imports.keepSeparate(doc.id)).rejects.toThrow();
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { FileSource } from '../src/ingest/sources';
import { migrate } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';
import { memoryDriver } from './db-helper';
import type { Document, ImportContext } from '../src/ingest/types';

const context: ImportContext = { accountId: 'march', accountKind: 'checking', currency: 'AUD', period: { start: '2026-03-01', end: '2026-03-31' }, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false };
const permutations = <T,>(values: readonly T[]): T[][] => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];

it('commits an actual March PDF and three CSV exports identically in all 24 orders', async () => {
  // Only the worker URL is adapted to Node; extraction, parsing, review and SQL
  // commit use the same implementation as the app.
  GlobalWorkerOptions.workerSrc = resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const names = ['march-statement.pdf', 'week-1.csv', 'week-2.csv', 'week-3.csv'];
  const docs: Document[] = [];
  for (const name of names) {
    const pdf = name.endsWith('.pdf');
    docs.push(await new FileSource(new Uint8Array(readFileSync(`fixtures/mixed-source/${name}`)), name, 'CommBank').fetch({
      context: { ...context, period: pdf ? context.period : { start: `2026-03-${name === 'week-1.csv' ? '01' : name === 'week-2.csv' ? '08' : '15'}`, end: `2026-03-${name === 'week-1.csv' ? '07' : name === 'week-2.csv' ? '15' : '21'}` } },
      opening: pdf ? '1000.00' : '', closing: pdf ? '955.00' : '', payslip: false,
    }));
  }
  expect(docs.map(d => d.integrityTier)).toEqual(['A', 'C', 'C', 'C']);
  expect(docs.map(d => d.rows.length)).toEqual([9, 3, 3, 3]);
  let expected: unknown;
  for (const order of permutations(docs)) {
    const { driver, raw } = memoryDriver();
    try {
      await migrate(driver);
      const repo = repository(driver);
      await repo.addAccount({ id: 'march', name: 'Synthetic March account', institution: 'CommBank', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 100000n });
      for (const source of order) {
        await repo.imports.stage(structuredClone(source));
        const review = await repo.imports.review(source.id);
        expect(review.balance.valid).toBe(true);
        expect(review.uncertainCount).toBe(0);
        await repo.imports.commit(source.id);
      }
      const ledger = await repo.imports.ledger();
      expect(ledger).toHaveLength(9);
      expect(ledger.every(row => row.description.startsWith('EFTPOS ') && row.sources.length === 2)).toBe(true);
      expect(ledger.reduce((sum, row) => sum + BigInt(row.minor), 0n)).toBe(-4500n);
      const state = {
        ledger,
        transactions: await driver.query('SELECT * FROM transactions ORDER BY id'),
        sources: await driver.query('SELECT * FROM transaction_sources ORDER BY transaction_id,import_batch_id,source_row_id'),
        coverage: await driver.query('SELECT * FROM coverage_ranges ORDER BY id'),
      };
      expected ??= state;
      expect(state).toEqual(expected);
    } finally { raw.close(); }
  }
}, 60000);

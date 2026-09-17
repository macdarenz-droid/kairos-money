import { expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { base64, csvCell, exportArchive } from '../src/core/db/export';
import { migrate } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';
import { requiresUnlock } from '../src/core/crypto/lifecycle';
import { memoryDriver } from './db-helper';
import { seedSynthetic } from './fixtures';
it('exports all actual tables as JSON and CSV without corrupting exact values', async () => {
  const { driver, raw } = memoryDriver(); await migrate(driver); await seedSynthetic(driver);
  const archive = unzipSync(await exportArchive(repository(driver)));
  const json = JSON.parse(strFromU8(archive['kairos-money.json']!)) as { tables: Record<string, unknown[]> };
  expect(json.tables['accounts']).toHaveLength(1);
  expect(strFromU8(archive['transactions.csv']!)).toContain('"-500"');
  // One JSON plus a CSV per ledger table. It moves when a table joins the export — `debts` did, in
  // migration 5, because a debt is typed in by hand and cannot be re-derived the way a rate can.
  expect(Object.keys(archive)).toHaveLength(19); raw.close();
});
it('neutralizes spreadsheet formulas but preserves signed numeric money', () => {
  expect(csvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"'); expect(csvCell(-500)).toBe('"-500"');
  expect(csvCell('a"b')).toBe('"a""b"'); expect(base64(new Uint8Array([0,255]))).toBe('AP8=');
});
it('locks on launch and at exactly 60 seconds, including backwards clock changes', () => {
  expect(requiresUnlock(null, 100, false)).toBe(true);
  expect(requiresUnlock(100, 60099, true)).toBe(false);
  expect(requiresUnlock(100, 60100, true)).toBe(true);
  expect(requiresUnlock(100, 99, true)).toBe(true);
});

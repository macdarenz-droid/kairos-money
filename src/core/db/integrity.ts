import type { Driver } from './driver';

const recovery = 'The encrypted ledger is damaged. Restore a verified Kairos backup before making changes.';

export async function verifyIntegrity(driver: Driver): Promise<void> {
  const check = await driver.query('PRAGMA quick_check');
  const values = check.flatMap(row => Object.values(row));
  if (check.length !== 1 || !values.includes('ok')) throw new Error(recovery);
  if ((await driver.query('PRAGMA foreign_key_check')).length) throw new Error(recovery);
}

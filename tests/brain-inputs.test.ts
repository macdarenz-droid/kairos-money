import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {think} from '../src/brain';

it('reads everything the brain needs without writing, and dismissals hide advice', async () => {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Everyday', institution: '', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 50000n});
  await repo.addAccount({id: 's', name: 'Saver', institution: '', type: 'savings', currency: 'AUD', mask_last4: null, opening_balance_minor: 90000n});
  await repo.manual.save({id: 'x', kind: 'expense', accountId: 'a', destinationId: null, date: '2026-09-10', minor: '1250', description: 'Lunch', category: 'Eating out', notes: ''});
  const dump = async () => JSON.stringify(await Promise.all(['transactions', 'app_settings', 'signals', 'profiles', 'insights'].map(t => driver.query(`SELECT * FROM ${t} ORDER BY rowid`))));
  const before = await dump();
  const input = await repo.intelligence.inputs('2026-09-18', 'AUD');
  expect(await dump()).toBe(before);
  expect(input.holdings).toEqual({spendableMinor: '48750', savedMinor: '90000'});
  expect(think(input).spending.thisMonth.outMinor).toBe('1250');
  await repo.intelligence.dismissAdvice('build-buffer', '2026-09-18');
  expect((await repo.intelligence.inputs('2026-09-18', 'AUD')).dismissals).toEqual({'build-buffer': {count: 1, last: '2026-09-18'}});
  raw.close();
});

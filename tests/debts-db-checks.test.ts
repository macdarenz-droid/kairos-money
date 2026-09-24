import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';

const debt = (over: Record<string, unknown> = {}) => {
  const row = {id: 'd1', name: 'Card', account_id: null, currency: 'AUD', balance_minor: 150000, annual_rate_bp: 1999, minimum_minor: 2500, due_day: 15, opened_at: '2026-01-01', closed_at: null, ...over};
  return [`INSERT INTO debts(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, Object.values(row)] as const;
};
const iou = (over: Record<string, unknown> = {}) => {
  const row = {id: 'i1', person: 'Sam', direction: 'owed_to_me', currency: 'AUD', amount_minor: 2000, reason: 'Dinner', occurred_on: '2026-02-01', transaction_id: null, settled_at: null, ...over};
  return [`INSERT INTO ious(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, Object.values(row)] as const;
};

it('refuses debt and IOU rows the app would never write, even from a restore', async () => {
  const {driver} = memoryDriver(); await migrate(driver);
  await driver.execute(...debt());
  await driver.execute(...iou());
  for (const bad of [{id: 'x1', balance_minor: 12.5}, {id: 'x2', currency: 'AUDX'}, {id: 'x3', name: '  '}, {id: 'x4', annual_rate_bp: 100001}, {id: 'x5', opened_at: 'soon'}, {id: 'x6', closed_at: '1/2/2026'}])
    await expect(driver.execute(...debt(bad)), JSON.stringify(bad)).rejects.toThrow();
  for (const bad of [{id: 'y1', amount_minor: 0}, {id: 'y2', amount_minor: 3.5}, {id: 'y3', person: ''}, {id: 'y4', reason: 'x'.repeat(201)}, {id: 'y5', occurred_on: '2026-2-1'}, {id: 'y6', currency: 'A'}])
    await expect(driver.execute(...iou(bad)), JSON.stringify(bad)).rejects.toThrow();
  await expect(driver.execute('UPDATE debts SET balance_minor=? WHERE id=?', [1.5, 'd1'])).rejects.toThrow();
  await driver.execute('UPDATE debts SET closed_at=?, balance_minor=0 WHERE id=?', ['2026-03-01', 'd1']);
});

it('upgrades a database without touching rows already in it', async () => {
  const {driver} = memoryDriver(); await migrate(driver, 6);
  await driver.execute(...debt({balance_minor: 12.5}));
  await migrate(driver);
  expect((await driver.query('SELECT balance_minor FROM debts'))[0]?.balance_minor).toBe(12.5);
});

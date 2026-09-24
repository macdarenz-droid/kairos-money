import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {think} from '../src/brain';

const TODAY = '2026-09-18';
it('raises a due debt in another currency at its converted minimum, and names a debt with no rate', async () => {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Everyday', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 100000n});
  await repo.setDisplayCurrency('AUD');
  await repo.saveRates([{asOf: '2026-09-01', base: 'USD', quote: 'AUD', rateE8: 150000000n, source: 'test'}]);
  const debt = {accountId: null, balanceMinor: '100000', annualRateBp: '1999', dueDay: 20, openedAt: '2026-01-01', targetDate: null};
  await repo.debts.save({...debt, id: 'usd-card', name: 'US card', currency: 'USD', minimumMinor: '4000'});
  await repo.debts.save({...debt, id: 'php-loan', name: 'Peso loan', currency: 'PHP', minimumMinor: '50000'});
  const brain = think(await repo.intelligence.inputs(TODAY, 'AUD'));
  expect(brain.attention.find(a => a.kind === 'debt-due')).toMatchObject({kind: 'debt-due', debtId: 'usd-card', minor: '6000'});
  expect(brain.coverage.unconverted).toContain('PHP');
  raw.close();
});

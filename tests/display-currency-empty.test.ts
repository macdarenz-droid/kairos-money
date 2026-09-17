import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';

async function ledger() {
  const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Everyday', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  await repo.manual.save({id: 'x', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  return repo;
}

/**
 * He set "Show amounts in" to PHP and his accounts are not in PHP. This is what that does, measured
 * rather than supposed: the snapshot selects accounts WHERE currency = the displayed one, so it comes
 * back with nothing at all, and every Today and Insights figure is built from nothing.
 *
 * Kept as a test because it is the behaviour, not the intent. The intent is that "show amounts in PHP"
 * CONVERTS what he holds, the way the all-accounts total already does; a filter is doing a display
 * job. When that is fixed this test is the one that has to change, deliberately, and its failure is
 * the signal that it was.
 */
it('empties the analysis when amounts are shown in a currency no account is held in', async () => {
  const repo = await ledger();
  const own = await repo.intelligence.snapshot('2026-01-31', 'AUD');
  expect(own.accountIds).toHaveLength(1);
  expect(own.transactions).toHaveLength(1);

  const other = await repo.intelligence.snapshot('2026-01-31', 'PHP');
  expect(other.accountIds).toHaveLength(0);
  expect(other.transactions).toHaveLength(0);
});

/** The money is still there; only the view of it is empty. Nothing was lost by choosing a currency. */
it('leaves the ledger itself untouched, so the money is not gone, only unshown', async () => {
  const repo = await ledger();
  expect((await repo.accountBalances()).find(b => b.accountId === 'a')?.minor).toBe('-1250');
  expect((await repo.imports.ledgerPage('', 0, 5)).total).toBe(1);
});

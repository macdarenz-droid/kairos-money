import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {spendingPatterns} from '../src/intelligence/visuals/spending-patterns';

/** An AUD account with one hand-recorded 12.50 expense, and nothing else. */
async function ledger() {
  const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Everyday', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  await repo.manual.save({id: 'x', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  return repo;
}

/**
 * EXACTLY WHAT THE APP FETCHES. Rates.tsx asks the source for the DISPLAY currency as the base, so a
 * person showing amounts in PHP stores PHP→AUD. The conversion needed is AUD→PHP, the other way round.
 */
const publish = (repo: Repository, asOf = '2026-01-01') =>
  repo.saveRates([{asOf, base: 'PHP', quote: 'AUD', rateE8: 2640000n, source: 'synthetic'}]);

const shown = async (repo: Repository, code: string) => repo.intelligence.snapshot('2026-01-31', code);

/**
 * "if i set an aud acct, and i change settings to php it should auto convert all the displayed money
 * currency in realtime values. thats what i only want."
 *
 * It did the opposite: the snapshot selected accounts WHERE currency = the displayed one, so choosing a
 * currency he held no account in emptied Today and Insights entirely — a filter doing a display job.
 */
describe('showing amounts in another currency', () => {
  it('converts what he holds instead of hiding it', async () => {
    const repo = await ledger(); await publish(repo);
    const php = await shown(repo, 'PHP');
    expect(php.accountIds).toHaveLength(1);
    expect(php.transactions).toHaveLength(1);
    // 12.50 AUD at 0.0264 AUD per PHP is 473.48 PHP, exact and integer throughout.
    expect(php.transactions[0]!.minor).toBe('-47348');
    expect(php.transactions[0]!.currency).toBe('PHP');
    expect(php.unconverted).toBeUndefined();
  });

  /** One published pair serves both ways. A ratio does not have a preferred direction. */
  it('uses a rate published in the other direction, which is the only direction it fetches', async () => {
    const repo = await ledger(); await publish(repo);
    expect((await shown(repo, 'PHP')).transactions[0]!.minor).toBe('-47348');
  });

  it('leaves the ledger in its own currency untouched', async () => {
    const repo = await ledger(); await publish(repo);
    const aud = await shown(repo, 'AUD');
    expect(aud.transactions[0]!.minor).toBe('-1250');
    expect(aud.transactions[0]!.currency).toBe('AUD');
  });

  it('carries the converted figures into what was spent', async () => {
    const repo = await ledger(); await publish(repo);
    expect(spendingPatterns(await shown(repo, 'PHP')).total).toBe('47348');
    expect(spendingPatterns(await shown(repo, 'AUD')).total).toBe('1250');
  });

  /**
   * A currency with no published rate is NAMED, never counted as zero and never passed through as
   * though it were already the displayed one. Both invent a number, and one of them silently.
   */
  it('names a currency it cannot convert rather than dropping it quietly', async () => {
    const repo = await ledger();
    const php = await shown(repo, 'PHP');
    expect(php.transactions).toHaveLength(0);
    expect(php.unconverted).toEqual(['AUD']);
  });

  /**
   * A purchase happened at the rate on the day it happened. Valuing it at today's would make last
   * month's lunch cost something different every time the app opens.
   */
  it('values a purchase at the rate for its own date, not the newest one', async () => {
    const repo = await ledger();
    await repo.saveRates([
      {asOf: '2026-01-01', base: 'PHP', quote: 'AUD', rateE8: 2640000n, source: 'synthetic'},
      // A later, very different rate. The January purchase must not be repriced by it.
      {asOf: '2026-01-25', base: 'PHP', quote: 'AUD', rateE8: 5280000n, source: 'synthetic'},
    ]);
    expect((await shown(repo, 'PHP')).transactions[0]!.minor).toBe('-47348');
  });

  /** Nothing about the stored money changes; only the way it is shown. */
  it('changes no stored amount, whichever currency is chosen', async () => {
    const repo = await ledger(); await publish(repo);
    await shown(repo, 'PHP');
    expect((await repo.accountBalances()).find(b => b.accountId === 'a')?.minor).toBe('-1250');
    expect((await repo.imports.ledgerPage('', 0, 5)).rows[0]?.minor).toBe('-1250');
  });
});

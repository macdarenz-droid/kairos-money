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

/**
 * "what if i set to usd, samething happens?"
 *
 * Yes — there is one code path, not a rule per currency. Every supported currency is checked here so
 * that stays true, including the two that break a conversion written carelessly: JPY has no minor units
 * at all and KWD has three, so a conversion that forgets to rescale is out by a hundred or a thousand
 * and says nothing. A$12.50 is the same purchase in every row below.
 *
 * Worth recording that this row caught ME rather than the code: I wrote 0.026 for the KWD case, having
 * divided correctly and then written the answer in two decimal places out of habit. 12.50 / 4.90 is
 * 2.551 KWD, which in three-decimal minor units is 2551. That is the exact mistake the row exists for.
 */
describe('every currency, not just the one that was asked about', () => {
  /** base = the DISPLAY currency, which is the direction Rates.tsx actually stores. */
  const at = (quote: string, rateE8: bigint) =>
    [{asOf: '2026-01-01', base: quote, quote: 'AUD', rateE8, source: 'synthetic'}];

  it.each([
    // display, AUD per 1 unit of display, what 12.50 AUD comes to
    ['USD', 150000000n, '-833'],      // 1.50 AUD per USD -> 8.33
    ['PHP', 2640000n, '-47348'],      // 0.0264 AUD per PHP -> 473.48
    ['EUR', 165000000n, '-758'],      // 1.65 AUD per EUR -> 7.58
    ['GBP', 195000000n, '-641'],      // 1.95 AUD per GBP -> 6.41
    ['SGD', 115000000n, '-1087'],     // 1.15 AUD per SGD -> 10.87
    ['JPY', 1000000n, '-1250'],       // 0.01 AUD per JPY -> 1250 yen, and yen has NO minor units
    ['KWD', 490000000n, '-2551'],     // 4.90 AUD per KWD -> 2.551, and KWD has THREE, so 2551
  ])('shows an AUD ledger in %s', async (code, rateE8, expected) => {
    const repo = await ledger();
    await repo.saveRates(at(code, rateE8));
    const snapshot = await repo.intelligence.snapshot('2026-01-31', code);
    expect(snapshot.transactions[0]!.minor).toBe(expected);
    expect(snapshot.transactions[0]!.currency).toBe(code);
    expect(snapshot.unconverted).toBeUndefined();
  });

  /**
   * A ledger holding two currencies, shown in one of them: the foreign side converts and the side
   * already in that currency passes through untouched rather than round-tripping through a rate.
   */
  it('converts the foreign side and leaves the native side exactly as it stands', async () => {
    const repo = await ledger();
    await repo.addAccount({id: 'u', name: 'Offshore', institution: '', type: 'checking',
      currency: 'USD', mask_last4: null, opening_balance_minor: 0n});
    await repo.manual.save({id: 'u1', kind: 'expense', accountId: 'u', destinationId: null,
      date: '2026-01-20', minor: '2000', description: 'Synthetic dinner', category: 'Eating out', notes: ''});
    await repo.saveRates(at('USD', 150000000n));

    const snapshot = await repo.intelligence.snapshot('2026-01-31', 'USD');
    const by = (text: string) => snapshot.transactions.find(t => t.description === text)!.minor;
    expect(by('Synthetic lunch')).toBe('-833');   // 12.50 AUD converted
    expect(by('Synthetic dinner')).toBe('-2000'); // 20.00 USD untouched
    expect(snapshot.unconverted).toBeUndefined();
  });

  /** Held in two currencies, shown in a third it has no rate for: both are named, neither is invented. */
  it('names every currency it cannot reach, not just the first', async () => {
    const repo = await ledger();
    await repo.addAccount({id: 'u', name: 'Offshore', institution: '', type: 'checking',
      currency: 'USD', mask_last4: null, opening_balance_minor: 0n});
    await repo.manual.save({id: 'u1', kind: 'expense', accountId: 'u', destinationId: null,
      date: '2026-01-20', minor: '2000', description: 'Synthetic dinner', category: 'Eating out', notes: ''});

    const snapshot = await repo.intelligence.snapshot('2026-01-31', 'PHP');
    expect(snapshot.transactions).toHaveLength(0);
    expect(snapshot.unconverted).toEqual(['AUD', 'USD']);
  });
});

/**
 * THE REGRESSION THE DEVICE CAUGHT, and the reason it is worth a test of its own.
 *
 * `covered` in intelligence/model.ts counts a day only when EVERY account in the snapshot has statement
 * coverage for it — money can move through an account you hold no statement for, so a gap in one is a
 * gap in all. Reading every account collided with that: a fixture went from 20 covered days to 8 the
 * moment a thinly-covered account joined, while that account's money was not in the analysis at all
 * because nothing could convert it.
 */
describe('an account whose currency cannot be reached', () => {
  async function mixed() {
    const repo = await ledger();
    await repo.addAccount({id: 'u', name: 'Offshore', institution: '', type: 'checking',
      currency: 'USD', mask_last4: null, opening_balance_minor: 0n});
    return repo;
  }

  it('is left out of the analysis rather than dragging its coverage down', async () => {
    const repo = await mixed();
    const snapshot = await repo.intelligence.snapshot('2026-01-31', 'AUD');
    expect(snapshot.accountIds).toEqual(['a']);
    expect(snapshot.unconverted).toEqual(['USD']);
  });

  /** With a rate it joins, and the coverage rule tightens by itself — which is the correct direction. */
  it('joins the analysis as soon as a rate reaches it', async () => {
    const repo = await mixed();
    await repo.saveRates([{asOf: '2026-01-01', base: 'AUD', quote: 'USD', rateE8: 66000000n, source: 'synthetic'}]);
    const snapshot = await repo.intelligence.snapshot('2026-01-31', 'AUD');
    expect(snapshot.accountIds.sort()).toEqual(['a', 'u']);
    expect(snapshot.unconverted).toBeUndefined();
  });

  /** Named even with nothing in it, so an empty account is never a silent omission either. */
  it('is named even when it holds no transactions at all', async () => {
    const repo = await mixed();
    expect((await repo.intelligence.snapshot('2026-01-31', 'AUD')).unconverted).toEqual(['USD']);
  });
});

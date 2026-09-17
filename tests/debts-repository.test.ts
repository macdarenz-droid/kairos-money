import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';

async function ledger() {
  const {driver} = memoryDriver();
  await migrate(driver);
  return {driver, repo: repository(driver)};
}

const card = {id: 'card', name: 'Synthetic card', accountId: null, currency: 'AUD' as const,
  balanceMinor: '300000', annualRateBp: '2400', minimumMinor: '10000', dueDay: 15, openedAt: '2026-01-01'};

describe('recording a debt', () => {
  it('reads back exactly what was written', async () => {
    const {repo} = await ledger();
    await repo.debts.save(card);
    expect(await repo.debts.list()).toEqual([{...card, closedAt: null}]);
  });

  it('trims the name and refuses an empty one', async () => {
    const {repo} = await ledger();
    await repo.debts.save({...card, name: '  Spaced out  '});
    expect((await repo.debts.list())[0]?.name).toBe('Spaced out');
    await expect(repo.debts.save({...card, id: 'blank', name: '   '})).rejects.toThrow();
  });

  /** A balance owed is positive here by design; a negative one would silently flip the projection. */
  it('refuses a negative balance, a negative minimum and a float', async () => {
    const {repo} = await ledger();
    await expect(repo.debts.save({...card, balanceMinor: '-1'})).rejects.toThrow();
    await expect(repo.debts.save({...card, minimumMinor: '-1'})).rejects.toThrow();
    await expect(repo.debts.save({...card, balanceMinor: '1.5'})).rejects.toThrow();
  });

  /** 19.99% typed into a basis-points box is 1999. Somebody typing 199900 has made a mistake. */
  it('refuses a rate far above any lender', async () => {
    const {repo} = await ledger();
    await expect(repo.debts.save({...card, annualRateBp: '199900'})).rejects.toThrow();
    await repo.debts.save({...card, annualRateBp: '0'});
    expect((await repo.debts.list())[0]?.annualRateBp).toBe('0');
  });

  it('refuses a due day that is not a day of the month, and accepts none at all', async () => {
    const {repo} = await ledger();
    await expect(repo.debts.save({...card, dueDay: 0})).rejects.toThrow();
    await expect(repo.debts.save({...card, dueDay: 32})).rejects.toThrow();
    await repo.debts.save({...card, dueDay: null});
    expect((await repo.debts.list())[0]?.dueDay).toBeNull();
  });

  it('refuses an account that does not exist', async () => {
    const {repo} = await ledger();
    await expect(repo.debts.save({...card, accountId: 'nope'})).rejects.toThrow();
  });

  /** A debt in pesos held on a dollar account is two different amounts pretending to be one. */
  it('refuses an account in another currency and accepts one that matches', async () => {
    const {repo} = await ledger();
    await repo.addAccount({id: 'aud', name: 'Everyday', institution: 'Synthetic Bank', type: 'credit',
      currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
    await expect(repo.debts.save({...card, currency: 'PHP', accountId: 'aud'})).rejects.toThrow();
    await repo.debts.save({...card, accountId: 'aud'});
    expect((await repo.debts.list())[0]?.accountId).toBe('aud');
  });
});

describe('editing and clearing a debt', () => {
  it('changes the balance without creating a second debt', async () => {
    const {repo} = await ledger();
    await repo.debts.save(card);
    await repo.debts.save({...card, balanceMinor: '250000'});
    const rows = await repo.debts.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.balanceMinor).toBe('250000');
  });

  /**
   * Editing a cleared debt must not quietly bring it back. Clearing is a decision; a typo fixed on the
   * name of a debt paid off last year is not a statement that it is owed again.
   */
  it('keeps a cleared debt cleared when it is edited', async () => {
    const {repo} = await ledger();
    await repo.debts.save(card);
    await repo.debts.close('card', '2026-06-30');
    await repo.debts.save({...card, name: 'Renamed'});
    const [row] = await repo.debts.list();
    expect(row?.closedAt).toBe('2026-06-30');
    expect(row?.name).toBe('Renamed');
  });

  it('clearing sets the balance to nothing and keeps the record', async () => {
    const {repo} = await ledger();
    await repo.debts.save(card);
    await repo.debts.close('card', '2026-06-30');
    const [row] = await repo.debts.list();
    expect(row?.balanceMinor).toBe('0');
    expect(row?.closedAt).toBe('2026-06-30');
  });

  it('refuses to clear a debt before it started, or one that is not there', async () => {
    const {repo} = await ledger();
    await repo.debts.save(card);
    await expect(repo.debts.close('card', '2025-12-31')).rejects.toThrow();
    await expect(repo.debts.close('missing', '2026-06-30')).rejects.toThrow();
  });

  it('can be reopened when it was cleared by mistake', async () => {
    const {repo} = await ledger();
    await repo.debts.save(card);
    await repo.debts.close('card', '2026-06-30');
    await repo.debts.reopen('card');
    expect((await repo.debts.list())[0]?.closedAt).toBeNull();
  });

  it('removes one that was never real', async () => {
    const {repo} = await ledger();
    await repo.debts.save(card);
    await repo.debts.remove('card');
    expect(await repo.debts.list()).toEqual([]);
  });

  /** Open debts first: what is still owed is what anybody opening this screen came to see. */
  it('lists what is still owed before what is cleared', async () => {
    const {repo} = await ledger();
    await repo.debts.save({...card, id: 'aaa-cleared', name: 'A cleared debt'});
    await repo.debts.save({...card, id: 'zzz-open', name: 'Z open debt'});
    await repo.debts.close('aaa-cleared', '2026-06-30');
    expect((await repo.debts.list()).map(d => d.id)).toEqual(['zzz-open', 'aaa-cleared']);
  });
});

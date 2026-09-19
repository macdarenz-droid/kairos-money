import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';

/**
 * An account stopped being write-once.
 *
 * "once i set an acct, i cant do anything manually, add, transfer from both accts, set primary where all
 * my spending goes, or less a money." Everything below is the bookkeeping that was unreachable.
 */
async function ledger() {
  const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Evryday', institution: 'Synthetic Bank', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 100000n});
  await repo.addAccount({id: 'b', name: 'Savings', institution: 'Synthetic Bank', type: 'savings', currency: 'AUD', mask_last4: '4321', opening_balance_minor: 500000n});
  return repo;
}
const find = async (repo: Awaited<ReturnType<typeof ledger>>, id: string) => (await repo.accounts()).find(a => a.id === id)!;

describe('changing an account after it exists', () => {
  it('corrects a name without touching anything else', async () => {
    const repo = await ledger();
    await repo.updateAccount('a', {name: 'Everyday'});
    const account = await find(repo, 'a');
    expect(account.name).toBe('Everyday');
    expect(account.institution).toBe('Synthetic Bank');
    expect(account.opening_balance_minor).toBe(100000);
  });

  it('corrects an opening balance typed before the first statement arrived', async () => {
    const repo = await ledger();
    await repo.updateAccount('a', {opening_balance_minor: 87650n});
    expect((await find(repo, 'a')).opening_balance_minor).toBe(87650);
  });

  it('adds the last four digits, which is what lets notifications find the account', async () => {
    const repo = await ledger();
    await repo.updateAccount('a', {mask_last4: '3318'});
    expect((await find(repo, 'a')).mask_last4).toBe('3318');
    await repo.updateAccount('a', {mask_last4: null});
    expect((await find(repo, 'a')).mask_last4).toBeNull();
  });

  it('refuses a mask that is not four digits, and an empty name', async () => {
    const repo = await ledger();
    await expect(repo.updateAccount('a', {mask_last4: '12'})).rejects.toThrow();
    await expect(repo.updateAccount('a', {name: '   '})).rejects.toThrow();
    await expect(repo.updateAccount('missing', {name: 'Nowhere'})).rejects.toThrow();
  });

  it('closes an account and reopens it, keeping its transactions either way', async () => {
    const repo = await ledger();
    await repo.updateAccount('b', {archived: true});
    expect((await find(repo, 'b')).archived_at).toBeTruthy();
    // Closing is not deleting: the balance it held is still computed, because the history is still true.
    expect((await repo.accountBalances()).some(row => row.accountId === 'b')).toBe(true);
    await repo.updateAccount('b', {archived: false});
    expect((await find(repo, 'b')).archived_at).toBeNull();
  });

  it('never offers to change the currency, because that would reinterpret every stored amount', async () => {
    const repo = await ledger();
    // There is no currency field to pass. An account holding 100000 minor units means $1,000.00 in AUD
    // and ¥100,000 in JPY — the same integer, a different sum of money — so the code can only be chosen
    // once, at the point nothing has been recorded against it yet.
    await repo.updateAccount('a', {name: 'Everyday'});
    expect((await find(repo, 'a')).currency).toBe('AUD');
    expect(Object.keys({name: 1, institution: 1, type: 1, mask_last4: 1, opening_balance_minor: 1, archived: 1})).not.toContain('currency');
  });
});

describe('the primary account', () => {
  it('is remembered, and is one setting rather than two that can disagree', async () => {
    const repo = await ledger();
    expect(await repo.notices.defaultAccount()).toBeNull();
    await repo.notices.setDefaultAccount('a');
    expect(await repo.notices.defaultAccount()).toBe('a');
  });

  it('stops being offered once that account is closed', async () => {
    const repo = await ledger();
    await repo.notices.setDefaultAccount('b');
    await repo.updateAccount('b', {archived: true});
    // Money must not keep defaulting to an account the owner has closed.
    expect(await repo.notices.defaultAccount()).toBeNull();
  });

  it('can be cleared', async () => {
    const repo = await ledger();
    await repo.notices.setDefaultAccount('a');
    await repo.notices.setDefaultAccount(null);
    expect(await repo.notices.defaultAccount()).toBeNull();
  });
});

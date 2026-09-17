import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {netByPerson, type Iou} from '../src/ledger/people';
import {currency} from '../src/core/money';

async function ledger() {
  const {driver} = memoryDriver();
  await migrate(driver);
  return {driver, repo: repository(driver)};
}

const entry = (over: Partial<Iou> = {}): Iou => ({
  id: 'i1', person: 'Alex', direction: 'owed_to_me', currency: 'AUD', amountMinor: '2000',
  reason: 'Dinner', occurredOn: '2026-09-01', transactionId: null, settledAt: null, ...over});

describe('netting money between people', () => {
  /** Four dinners and two taxis between the same two people is ONE number, and it is the one said aloud. */
  it('collapses many entries with one person into a single figure', () => {
    const [net, ...rest] = netByPerson([
      entry({id: 'a', amountMinor: '2000'}),
      entry({id: 'b', amountMinor: '3000'}),
      entry({id: 'c', amountMinor: '500', direction: 'owed_by_me'}),
    ], currency('AUD'));
    expect(rest).toEqual([]);
    expect(net?.netMinor).toBe('4500');
    expect(net?.owedToMeMinor).toBe('5000');
    expect(net?.owedByMeMinor).toBe('500');
    expect(net?.items).toHaveLength(3);
  });

  it('holds the sign the right way round when you are the one who owes', () => {
    const [net] = netByPerson([entry({direction: 'owed_by_me'})], currency('AUD'));
    expect(net?.netMinor).toBe('-2000');
  });

  /** Nought owed either way is not a fact that needs a row; it is a person you have finished with. */
  it('drops anyone whose entries cancel out exactly', () => {
    expect(netByPerson([
      entry({id: 'a', amountMinor: '2000'}),
      entry({id: 'b', amountMinor: '2000', direction: 'owed_by_me'}),
    ], currency('AUD'))).toEqual([]);
  });

  it('leaves settled entries out of the figure', () => {
    const nets = netByPerson([
      entry({id: 'a', amountMinor: '2000', settledAt: '2026-09-10'}),
      entry({id: 'b', amountMinor: '700'}),
    ], currency('AUD'));
    expect(nets[0]?.netMinor).toBe('700');
    expect(nets[0]?.items).toHaveLength(1);
  });

  it('ignores another currency rather than adding it in', () => {
    expect(netByPerson([entry({currency: 'PHP'})], currency('AUD'))).toEqual([]);
  });

  /** Biggest outstanding first whichever way it goes: that is the one worth doing something about. */
  it('orders by size regardless of direction, then by name', () => {
    const nets = netByPerson([
      entry({id: 'a', person: 'Small', amountMinor: '100'}),
      entry({id: 'b', person: 'Big owed by me', amountMinor: '9000', direction: 'owed_by_me'}),
      entry({id: 'c', person: 'Middle', amountMinor: '500'}),
    ], currency('AUD'));
    expect(nets.map(n => n.person)).toEqual(['Big owed by me', 'Middle', 'Small']);
  });

  it('puts the newest entry behind a figure first', () => {
    const [net] = netByPerson([
      entry({id: 'a', occurredOn: '2026-08-01'}),
      entry({id: 'b', occurredOn: '2026-09-05'}),
    ], currency('AUD'));
    expect(net?.items.map(i => i.id)).toEqual(['b', 'a']);
  });
});

describe('recording money between people', () => {
  it('reads back exactly what was written', async () => {
    const {repo} = await ledger();
    await repo.people.save({...entry(), settledAt: undefined} as never);
    expect(await repo.people.list()).toEqual([entry()]);
  });

  it('refuses an amount of nothing, an unnamed person and a reason nobody gave', async () => {
    const {repo} = await ledger();
    await expect(repo.people.save(entry({amountMinor: '0'}))).rejects.toThrow();
    await expect(repo.people.save(entry({amountMinor: '-100'}))).rejects.toThrow();
    await expect(repo.people.save(entry({person: '  '}))).rejects.toThrow();
    await expect(repo.people.save(entry({reason: ''}))).rejects.toThrow();
  });

  it('refuses a direction that is neither', async () => {
    const {repo} = await ledger();
    await expect(repo.people.save(entry({direction: 'sideways' as never}))).rejects.toThrow();
  });

  it('refuses a transaction that is not there', async () => {
    const {repo} = await ledger();
    await expect(repo.people.save(entry({transactionId: 'nope'}))).rejects.toThrow();
  });

  /** Settling is its own decision. Fixing a typo on a squared-up entry does not open it again. */
  it('keeps a settled entry settled when it is edited', async () => {
    const {repo} = await ledger();
    await repo.people.save(entry());
    await repo.people.settleOne('i1', '2026-09-10');
    await repo.people.save(entry({reason: 'Dinner, corrected'}));
    const [row] = await repo.people.list();
    expect(row?.settledAt).toBe('2026-09-10');
    expect(row?.reason).toBe('Dinner, corrected');
  });

  /** People settle with each other all at once, not one dinner at a time. */
  it('settles everything open with one person in a single go', async () => {
    const {repo} = await ledger();
    await repo.people.save(entry({id: 'a'}));
    await repo.people.save(entry({id: 'b', amountMinor: '400', direction: 'owed_by_me'}));
    await repo.people.save(entry({id: 'c', person: 'Someone else'}));
    await repo.people.settle('Alex', '2026-09-17');
    const rows = await repo.people.list();
    expect(rows.filter(r => r.settledAt !== null).map(r => r.id).sort()).toEqual(['a', 'b']);
    expect(rows.find(r => r.id === 'c')?.settledAt).toBeNull();
  });

  it('can be reopened, and removed when it was never real', async () => {
    const {repo} = await ledger();
    await repo.people.save(entry());
    await repo.people.settleOne('i1', '2026-09-10');
    await repo.people.reopen('i1');
    expect((await repo.people.list())[0]?.settledAt).toBeNull();
    await repo.people.remove('i1');
    expect(await repo.people.list()).toEqual([]);
  });

  it('survives a backup and a restore', async () => {
    const source = await ledger();
    await source.repo.people.save(entry());
    const snapshot = await source.repo.exportAll();
    expect(snapshot.tables['ious']).toHaveLength(1);
    const restored = await ledger();
    await restored.repo.restoreBackup(snapshot);
    expect(await restored.repo.people.list()).toEqual([entry()]);
  });
});

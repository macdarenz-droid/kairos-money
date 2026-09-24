// @vitest-environment jsdom
import {act, cleanup, renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';

/**
 * "Once i click add txn, it opens the app. That should not be the case." The sheet on the home screen
 * writes an outbox; this is the side that turns it into the ledger's own hand-recorded transactions.
 */
const native = vi.hoisted(() => ({enabled: true, entries: [] as unknown[], cleared: [] as string[][], configured: [] as unknown[]}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => native.enabled}, registerPlugin: (name: string) => name === 'KairosQuickAdd' ? {
  configure: async (config: unknown) => { native.configured.push(config); },
  pending: async () => ({entries: native.entries}),
  clear: async ({ids}: {ids: string[]}) => { native.cleared.push(ids); native.entries = (native.entries as {id: string}[]).filter(e => !ids.includes(e.id)); },
} : {}}));
import {accountForQuickAdd, manualFromQuickAdd, type QuickAddEntry} from '../src/ingest/quick-add';
import {useQuickAddOutbox} from '../src/ui/quick-add';
import {localDay} from '../src/ingest/reminders';

const entry = (over: Partial<QuickAddEntry> = {}): QuickAddEntry => ({id: 'e1', amount: '4.50', direction: 'spent', category: 'Coffee & snacks', currency: 'AUD', accountId: 'a', at: Date.UTC(2026, 8, 19, 3), ...over});
const account = (id: string, currency: string, archived_at: string | null = null) => ({id, name: id, currency, archived_at});

describe('an outbox entry as a hand-recorded transaction', () => {
  it('becomes minor units in the account\'s currency, with the category the ledger knows', () => {
    const input = manualFromQuickAdd(entry(), {id: 'a', currency: 'AUD'});
    expect(input).toMatchObject({id: 'quick-e1', kind: 'expense', accountId: 'a', minor: '450', category: 'Coffee & snacks', description: 'Coffee & snacks'});
    expect(input.date).toBe(localDay(new Date(Date.UTC(2026, 8, 19, 3))));
    expect(manualFromQuickAdd(entry({direction: 'received', amount: '200'}), {id: 'a', currency: 'AUD'})).toMatchObject({kind: 'income', minor: '20000', category: null, description: 'Money in'});
    expect(manualFromQuickAdd(entry({category: 'Not a category'}), {id: 'a', currency: 'AUD'})).toMatchObject({category: null, description: 'Purchase'});
    expect(() => manualFromQuickAdd(entry({amount: '0'}), {id: 'a', currency: 'AUD'})).toThrow('above zero');
  });
  it('lands in the account it was typed for, else one holding the same money, else nowhere', () => {
    const accounts = [account('a', 'AUD'), account('p', 'PHP'), account('m', 'AUD')];
    expect(accountForQuickAdd(entry(), accounts, 'm')?.id).toBe('a');
    expect(accountForQuickAdd(entry({accountId: 'gone'}), accounts, 'm')?.id).toBe('m');
    expect(accountForQuickAdd(entry({accountId: 'gone'}), accounts, null)?.id).toBe('a');
    expect(accountForQuickAdd(entry({accountId: 'gone', currency: 'USD'}), accounts, 'm')).toBeNull();
    expect(accountForQuickAdd(entry(), [account('a', 'AUD', '2026-01-01')], null)).toBeNull();
  });
});

describe('draining the outbox on unlock', () => {
  let repo: Repository;
  beforeEach(async () => {
    const {driver} = memoryDriver(); await migrate(driver); repo = repository(driver);
    await repo.addAccount({id: 'a', name: 'Everyday', type: 'checking', currency: 'AUD', institution: 'Synthetic', mask_last4: null, opening_balance_minor: 0n});
    native.enabled = true; native.entries = []; native.cleared = []; native.configured = [];
  });
  afterEach(cleanup);
  it('records each entry once, clears it, tells the sheet where money goes, and says how many', async () => {
    native.entries = [entry(), entry({id: 'e2', amount: '12', category: null})];
    const added = vi.fn();
    const run = <T,>(fn: (r: Repository) => Promise<T>) => fn(repo);
    renderHook(() => useQuickAddOutbox(true, run, [account('a', 'AUD')], 'a', added));
    await waitFor(() => expect(added).toHaveBeenCalledWith(2));
    const entries = await repo.manual.list();
    expect(entries.map(e => [e.id, e.minor, e.category]).sort()).toEqual([['quick-e1', '450', 'Coffee & snacks'], ['quick-e2', '1200', null]]);
    expect(native.cleared).toEqual([['e1', 'e2']]);
    expect(native.configured[0]).toMatchObject({accountId: 'a', accountName: 'a', currency: 'AUD', categories: ['Groceries', 'Coffee & snacks', 'Transport', 'Eating out', 'Shopping', 'Entertainment']});
    // Back to the front with nothing new: nothing recorded twice, nothing said.
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(added).toHaveBeenCalledTimes(1);
    expect(await repo.manual.list()).toHaveLength(2);
  });
  it('leaves an entry in money no open account holds, and does nothing off the phone', async () => {
    native.entries = [entry({currency: 'USD'})];
    const added = vi.fn();
    renderHook(() => useQuickAddOutbox(true, <T,>(fn: (r: Repository) => Promise<T>) => fn(repo), [account('a', 'AUD')], 'a', added));
    await waitFor(() => expect(native.configured).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(added).not.toHaveBeenCalled(); expect(native.cleared).toEqual([]); expect(native.entries).toHaveLength(1);
    native.enabled = false; native.configured = [];
    renderHook(() => useQuickAddOutbox(true, <T,>(fn: (r: Repository) => Promise<T>) => fn(repo), [account('a', 'AUD')], 'a', added));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(native.configured).toEqual([]);
  });
});

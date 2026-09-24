import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';

async function repo() { const {driver} = memoryDriver(); await migrate(driver); return repository(driver); }
const KEY = 'sk-ant-synthetic-0123456789abcdef';

it('starts off, with no key and nothing shared', async () => {
  const r = await repo();
  expect(await r.advisor.settings()).toEqual({enabled: false, model: 'claude-opus-5', merchantNames: false, sortConsent: false, autoSort: false});
  expect(await r.advisor.key()).toBeNull();
});

it('keeps settings and rejects an unknown model', async () => {
  const r = await repo();
  await r.advisor.save({enabled: true, model: 'claude-haiku-4-5', merchantNames: true, sortConsent: true, autoSort: true});
  expect(await r.advisor.settings()).toEqual({enabled: true, model: 'claude-haiku-4-5', merchantNames: true, sortConsent: true, autoSort: true});
  await expect(r.advisor.save({enabled: true, model: 'gpt-4' as never, merchantNames: false, sortConsent: false, autoSort: false})).rejects.toThrow();
});

it('stores the key as a secret that export and backup never carry', async () => {
  const r = await repo();
  await r.advisor.setKey(`  ${KEY}  `);
  expect(await r.advisor.key()).toBe(KEY);
  expect(JSON.stringify(await r.exportAll())).not.toContain(KEY);
  await expect(r.advisor.setKey('short')).rejects.toThrow();
  await expect(r.advisor.setKey('sk-ant has spaces inside it')).rejects.toThrow();
  await r.advisor.clearKey();
  expect(await r.advisor.key()).toBeNull();
});

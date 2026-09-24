import type {Driver} from '../core/db/driver';
import {SECRET_PREFIX} from '../core/db/schema';
import type {AdvisorModel} from '../core/net/claude';

/** The optional Claude advisor's switches (ADR 0045). Off until the owner turns it on. */
export type AdvisorSettings = {enabled: boolean; model: AdvisorModel; merchantNames: boolean; sortConsent: boolean; autoSort: boolean};
export const ADVISOR_MODELS: readonly AdvisorModel[] = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];
const DEFAULTS: AdvisorSettings = {enabled: false, model: 'claude-opus-5', merchantNames: false, sortConsent: false, autoSort: false};
const SETTINGS = 'advisor:settings', KEY = SECRET_PREFIX + 'anthropic-key';

export function advisorRepository(driver: Driver) {
  async function settings(): Promise<AdvisorSettings> {
    const row = (await driver.query('SELECT value FROM app_settings WHERE key=?', [SETTINGS]))[0];
    return row ? {...DEFAULTS, ...JSON.parse(String(row.value)) as Partial<AdvisorSettings>} : DEFAULTS;
  }
  async function save(next: AdvisorSettings) {
    if (!ADVISOR_MODELS.includes(next.model)) throw new Error('Choose one of the listed models.');
    const clean: AdvisorSettings = {enabled: next.enabled === true, model: next.model, merchantNames: next.merchantNames === true,
      sortConsent: next.sortConsent === true, autoSort: next.autoSort === true};
    await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)', [SETTINGS, JSON.stringify(clean)]);
  }
  async function key(): Promise<string | null> {
    const row = (await driver.query('SELECT value FROM app_settings WHERE key=?', [KEY]))[0];
    return row ? JSON.parse(String(row.value)) as string : null;
  }
  async function setKey(value: string) {
    const trimmed = value.trim();
    if (!/^\S{20,300}$/.test(trimmed)) throw new Error('That does not look like an API key. Paste the whole key.');
    await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)', [KEY, JSON.stringify(trimmed)]);
  }
  async function clearKey() { await driver.execute('DELETE FROM app_settings WHERE key=?', [KEY]); }
  return {settings, save, key, setKey, clearKey};
}

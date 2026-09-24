import type {Driver} from './driver';
import {bytesToHex, randomBytes} from '@noble/hashes/utils';

export type AdvisorResult = 'ok' | 'key' | 'busy' | 'offline' | 'refused' | 'invalid';
export type AdvisorCall = {model: string; inputTokens: number; outputTokens: number; costMicros: bigint; result: AdvisorResult; at?: string};
export type AdvisorCallRow = {id: string; at: string; model: string; inputTokens: number; outputTokens: number; costMicros: string; result: AdvisorResult};
const RESULTS: readonly string[] = ['ok', 'key', 'busy', 'offline', 'refused', 'invalid'];

/** Every call to the optional advisor, as shown in Settings › Privacy log. Cost is in micro-dollars. */
export function privacyRepository(driver: Driver) {
  async function logAdvisorCall(call: AdvisorCall) {
    const count = (n: number) => Number.isSafeInteger(n) && n >= 0;
    if (!/^[a-z0-9.-]{1,80}$/.test(call.model) || !count(call.inputTokens) || !count(call.outputTokens) || call.costMicros < 0n || !RESULTS.includes(call.result))
      throw new Error('That advisor call could not be logged.');
    const at = call.at ?? new Date().toISOString();
    await driver.execute('INSERT INTO privacy_log(id,created_at,action,import_batch_id,metadata) VALUES(?,?,?,NULL,?)',
      [bytesToHex(randomBytes(16)), at, 'advisor_call', JSON.stringify({model: call.model, inputTokens: call.inputTokens, outputTokens: call.outputTokens, costMicros: call.costMicros.toString(), result: call.result})]);
  }
  async function advisorCalls(): Promise<AdvisorCallRow[]> {
    const rows = await driver.query("SELECT id,created_at,metadata FROM privacy_log WHERE action='advisor_call' ORDER BY created_at DESC,id DESC LIMIT 500");
    return rows.map(row => {
      const m = JSON.parse(String(row.metadata)) as Omit<AdvisorCallRow, 'id' | 'at'>;
      return {id: String(row.id), at: String(row.created_at), model: m.model, inputTokens: m.inputTokens, outputTokens: m.outputTokens, costMicros: m.costMicros, result: m.result};
    });
  }
  return {logAdvisorCall, advisorCalls};
}

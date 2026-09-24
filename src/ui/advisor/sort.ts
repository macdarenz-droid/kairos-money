import type {Repository} from '../../core/db/repository';
import type {AiRun, Payload} from '../../ledger/ai-categories';
import {editableCategories} from '../../ledger/categories';
import type {AdvisorModel, FailureReason, Options, Result, Usage} from '../../core/net/claude';
import {costMicros, MAX_MERCHANTS} from '../../core/net/claude';

export type Run = <T>(fn: (repo: Repository) => Promise<T>) => Promise<T>;
export type SortReason = FailureReason | 'setup' | 'nothing';
export type SortResult = {ok: true; run: AiRun; usage: Usage} | {ok: false; reason: SortReason; run?: AiRun};

/** Plain words for every way a call can fail; nothing is changed in any of them. */
export const REASONS: Record<SortReason, string> = {
  key: 'Anthropic did not accept the key. Check it in Settings.',
  busy: 'Kairos AI is busy. Try again in a minute.',
  offline: 'No connection. Try again when you are online.',
  refused: 'Kairos AI declined this request.',
  invalid: 'Kairos AI’s answer could not be read.',
  setup: 'Turn on the advisor, add a key and allow sorting first.',
  nothing: 'Every merchant is already sorted.',
};

/** Rough ceiling for a run: characters over four for input, thirty tokens a merchant out, doubled when the model thinks. */
export function estimateMicros(payload: Payload, model: AdvisorModel): bigint {
  let input = 0;
  for (let start = 0; start < payload.sent.merchants.length; start += MAX_MERCHANTS)
    input += Math.ceil(JSON.stringify({categories: editableCategories, examples: payload.sent.examples, merchants: payload.sent.merchants.slice(start, start + MAX_MERCHANTS)}).length / 4) + 300;
  const output = payload.sent.merchants.length * 30 * (model === 'claude-haiku-4-5' ? 1 : 2);
  return costMicros(model, input, output);
}

/** One logged call per run, success or not; the privacy log shows each. */
export async function logCall<T>(run: Run, result: Result<T>, model: AdvisorModel) {
  const usage = result.usage;
  await run(repo => repo.privacy.logAdvisorCall({model: usage?.model ?? model, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0,
    costMicros: usage?.costMicros ?? 0n, result: result.ok ? 'ok' : result.reason}));
}

/** Sends the merchants nobody has sorted yet (only uncategorised ones with `onlyNew`) and stores the answers as one undoable run. */
export async function sortMerchants(run: Run, onlyNew: boolean, options: Options = {}): Promise<SortResult> {
  const {settings, key, payload} = await run(async repo => ({settings: await repo.advisor.settings(), key: await repo.advisor.key(), payload: await repo.aiCategories.payload(onlyNew)}));
  if (!settings.enabled || !settings.sortConsent || !key) return {ok: false, reason: 'setup'};
  if (!payload.sent.merchants.length) return {ok: false, reason: 'nothing'};
  const {categorise} = await import('../../core/net/claude');
  const result = await categorise({merchants: payload.sent.merchants, examples: payload.sent.examples}, editableCategories, key, settings.model, options);
  await logCall(run, result, settings.model);
  const keyed = (list: readonly {id: string; category: string; confidence: 'high' | 'medium' | 'low'}[]) =>
    list.flatMap(a => payload.keys[a.id] ? [{key: payload.keys[a.id]!, category: a.category, confidence: a.confidence}] : []);
  if (!result.ok) {
    // Answers from batches before the failure were paid for, so they are kept.
    if (!result.partial.length) return {ok: false, reason: result.reason};
    return {ok: false, reason: result.reason, run: await run(repo => repo.aiCategories.applyRun(keyed(result.partial), result.usage?.model ?? settings.model))};
  }
  return {ok: true, run: await run(repo => repo.aiCategories.applyRun(keyed(result.value), result.usage.model)), usage: result.usage};
}

/** After an import: sorts only new, uncategorised merchants when the owner switched that on. Returns a sentence to show, or ''. */
export async function sortAfterImport(run: Run, options: Options = {}): Promise<string> {
  const settings = await run(repo => repo.advisor.settings());
  if (!settings.enabled || !settings.sortConsent || !settings.autoSort) return '';
  const result = await sortMerchants(run, true, options);
  if (result.ok) return result.run.applied.length ? `Kairos AI sorted ${result.run.applied.length} new ${result.run.applied.length === 1 ? 'merchant' : 'merchants'}.` : '';
  if (result.reason === 'nothing' || result.reason === 'setup') return '';
  const done = result.run?.applied.length ?? 0;
  return done ? `Kairos AI sorted ${done} new ${done === 1 ? 'merchant' : 'merchants'}; the rest were not: ${REASONS[result.reason]}` : `New merchants were not sorted: ${REASONS[result.reason]}`;
}

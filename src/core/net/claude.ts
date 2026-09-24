import {Capacitor, CapacitorHttp} from '@capacitor/core';
import type Anthropic from '@anthropic-ai/sdk';
import type {BrainSummary} from '../../brain/types';

/**
 * The optional Claude advisor (ADR 0045). It sees only a BrainSummary (aggregates and rule ids) or a
 * masked merchant list, with the owner's own key, and every point it returns must cite facts it was given.
 */
export type AdvisorModel = 'claude-opus-5' | 'claude-sonnet-5' | 'claude-haiku-4-5';
export const DEFAULT_MODEL: AdvisorModel = 'claude-opus-5';
export type FailureReason = 'key' | 'busy' | 'offline' | 'refused' | 'invalid';
export type Usage = {model: string; inputTokens: number; outputTokens: number; costMicros: bigint};
export type Point = {text: string; facts: string[]};
export type Result<T> = {ok: true; value: T; usage: Usage} | {ok: false; reason: FailureReason; usage: Usage | null};
export type Options = {fetch?: typeof fetch; maxRetries?: number};

/** Dollars per million tokens is micro-dollars per token: input, output. */
const PRICES: Record<string, readonly [bigint, bigint]> = {
  'claude-opus-5': [5n, 25n], 'claude-opus-4-8': [5n, 25n], 'claude-sonnet-5': [2n, 10n], 'claude-haiku-4-5': [1n, 5n],
};
export function costMicros(model: string, inputTokens: number, outputTokens: number): bigint {
  const [input, output] = PRICES[model] ?? PRICES['claude-opus-5']!;
  return BigInt(inputTokens) * input + BigInt(outputTokens) * output;
}

const MAX_POINTS = 5, MAX_TEXT = 400, MAX_QUESTION = 300;
export const MAX_MERCHANTS = 150;

/** fetch over the native HTTP client, outside the WebView: timeouts set, abort honoured. */
export const nativeFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  const body = typeof init?.body === 'string' ? init.body : undefined;
  const signal = init?.signal;
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
  const request = CapacitorHttp.request({method: init?.method ?? 'GET', url, headers, connectTimeout: 15000, readTimeout: 120000,
    responseType: 'json', ...(body === undefined ? {} : {data: JSON.parse(body) as unknown})});
  const aborted = new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('The request was cancelled.', 'AbortError')), {once: true}));
  const response = await Promise.race([request, aborted]);
  // The native client parses JSON already; the SDK expects the text back.
  const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  return new Response(text, {status: response.status, headers: response.headers});
};

async function client(key: string, options: Options) {
  const {default: Sdk} = await import('@anthropic-ai/sdk');
  return new Sdk({apiKey: key, dangerouslyAllowBrowser: true, timeout: 120000, maxRetries: options.maxRetries ?? 1,
    fetch: options.fetch ?? (Capacitor.isNativePlatform() ? nativeFetch : globalThis.fetch.bind(globalThis))});
}

/** Per-model settings: Opus adaptive at medium effort with refusal fallback; Sonnet adaptive; Haiku neither. */
export function request(model: AdvisorModel, system: string, user: string, schema: Record<string, unknown>): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const format = {type: 'json_schema' as const, schema};
  const base = {model, max_tokens: 16000, system, messages: [{role: 'user' as const, content: user}]};
  if (model === 'claude-haiku-4-5') return {...base, output_config: {format}};
  if (model === 'claude-sonnet-5') return {...base, thinking: {type: 'adaptive'}, output_config: {format}};
  return {...base, thinking: {type: 'adaptive'}, output_config: {format, effort: 'medium'}, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'};
}

async function call(key: string, model: AdvisorModel, system: string, user: string, schema: Record<string, unknown>, options: Options): Promise<Result<unknown>> {
  const {default: Sdk} = await import('@anthropic-ai/sdk');
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await (await client(key, options)).beta.messages.create(request(model, system, user, schema));
  } catch (error) {
    if (error instanceof Sdk.AuthenticationError || error instanceof Sdk.PermissionDeniedError) return {ok: false, reason: 'key', usage: null};
    if (error instanceof Sdk.RateLimitError || error instanceof Sdk.InternalServerError) return {ok: false, reason: 'busy', usage: null};
    if (error instanceof Sdk.APIConnectionError) return {ok: false, reason: 'offline', usage: null};
    return {ok: false, reason: 'invalid', usage: null};
  }
  const served = message.model;
  const usage: Usage = {model: served, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens,
    costMicros: costMicros(served, message.usage.input_tokens, message.usage.output_tokens)};
  // Read nothing before the stop reason says there is a finished answer.
  if (message.stop_reason === 'refusal') return {ok: false, reason: 'refused', usage};
  if (message.stop_reason !== 'end_turn') return {ok: false, reason: 'invalid', usage};
  const text = message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('');
  try { return {ok: true, value: JSON.parse(text) as unknown, usage}; }
  catch { return {ok: false, reason: 'invalid', usage}; }
}

const POINTS_SCHEMA = {type: 'object', additionalProperties: false, required: ['points'], properties: {
  points: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['text', 'facts'],
    properties: {text: {type: 'string'}, facts: {type: 'array', items: {type: 'string'}}}}}}};
const ADVISOR = 'You write short, plain money advice for one person from a summary of their own figures. '
  + 'Use only the figures given. Every point must cite the fact ids it rests on. Amounts are integer minor units '
  + 'of the stated currency. Do not invent figures, merchants or accounts. At most five points, one or two sentences each.';

/** Keeps only points that cite facts the summary actually holds. */
export function validPoints(value: unknown, summary: BrainSummary): Point[] | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as {points?: unknown}).points)) return null;
  const known = new Set(summary.facts.map(f => f.fact));
  return ((value as {points: unknown[]}).points).flatMap(p => {
    if (!p || typeof p !== 'object') return [];
    const {text, facts} = p as {text?: unknown; facts?: unknown};
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT || !Array.isArray(facts) || !facts.length) return [];
    if (!facts.every(f => typeof f === 'string' && known.has(f))) return [];
    return [{text: text.trim(), facts: facts as string[]}];
  }).slice(0, MAX_POINTS);
}

async function points(summary: BrainSummary, user: string, key: string, model: AdvisorModel, options: Options): Promise<Result<Point[]>> {
  const result = await call(key, model, ADVISOR, user, POINTS_SCHEMA, options);
  if (!result.ok) return result;
  const valid = validPoints(result.value, summary);
  return valid && valid.length ? {ok: true, value: valid, usage: result.usage} : {ok: false, reason: 'invalid', usage: result.usage};
}

/** "Money review": a few cited points about the whole summary. */
export function review(summary: BrainSummary, key: string, model: AdvisorModel = DEFAULT_MODEL, options: Options = {}) {
  return points(summary, JSON.stringify({task: 'review', summary}), key, model, options);
}
/** "Ask Kairos": one question, answered from the summary only. */
export function ask(summary: BrainSummary, question: string, key: string, model: AdvisorModel = DEFAULT_MODEL, options: Options = {}) {
  const q = question.trim().slice(0, MAX_QUESTION);
  return points(summary, JSON.stringify({task: 'answer', question: q, summary}), key, model, options);
}

export type Merchant = {id: string; description: string; direction: 'in' | 'out' | 'both'; band: string; count: number; mcc: string | null; category: string | null};
export type Answer = {id: string; category: string; confidence: 'high' | 'medium' | 'low'};
const SORTER = 'You sort bank merchants into one of the given categories. Use the owner\'s examples as the '
  + 'strongest guide. Answer every merchant id once; if unsure, say low confidence.';

/** Claude's category for each merchant id, 150 per request. Unknown ids and categories are dropped. */
export async function categorise(batch: {merchants: readonly Merchant[]; examples: readonly {description: string; category: string}[]},
  categories: readonly string[], key: string, model: AdvisorModel = DEFAULT_MODEL, options: Options = {}): Promise<Result<Answer[]>> {
  const schema = {type: 'object', additionalProperties: false, required: ['answers'], properties: {answers: {type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['id', 'category', 'confidence'], properties: {
      id: {type: 'string'}, category: {type: 'string', enum: [...categories]}, confidence: {type: 'string', enum: ['high', 'medium', 'low']}}}}}};
  const answers: Answer[] = [];
  let usage: Usage | null = null;
  for (let start = 0; start < batch.merchants.length; start += MAX_MERCHANTS) {
    const part = batch.merchants.slice(start, start + MAX_MERCHANTS), ids = new Set(part.map(m => m.id));
    const result = await call(key, model, SORTER, JSON.stringify({categories, examples: batch.examples, merchants: part}), schema, options);
    if (result.usage) usage = usage ? {...result.usage, inputTokens: usage.inputTokens + result.usage.inputTokens,
      outputTokens: usage.outputTokens + result.usage.outputTokens, costMicros: usage.costMicros + result.usage.costMicros} : result.usage;
    if (!result.ok) return {ok: false, reason: result.reason, usage};
    const list = (result.value as {answers?: unknown}).answers;
    if (!Array.isArray(list)) return {ok: false, reason: 'invalid', usage};
    const seen = new Set<string>();
    for (const a of list as Partial<Answer>[]) {
      if (typeof a?.id !== 'string' || !ids.has(a.id) || seen.has(a.id) || typeof a.category !== 'string' || !categories.includes(a.category)
        || (a.confidence !== 'high' && a.confidence !== 'medium' && a.confidence !== 'low')) continue;
      seen.add(a.id); answers.push({id: a.id, category: a.category, confidence: a.confidence});
    }
  }
  return usage ? {ok: true, value: answers, usage} : {ok: true, value: answers, usage: {model, inputTokens: 0, outputTokens: 0, costMicros: 0n}};
}

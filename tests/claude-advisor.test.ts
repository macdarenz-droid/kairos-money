import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ask, categorise, costMicros, review, type AdvisorModel} from '../src/core/net/claude';
import type {BrainSummary} from '../src/brain/types';

const summary = {asOf: '2026-09-18', currency: 'AUD', tier: 'recorded', coverage: {coveredDays: 0, totalDays: 90, gapCount: 1},
  today: {status: 'ok', spendTodayMinor: '4000', keepTodayMinor: '1500', horizonDays: 12, committedMinor: '9000', method: 'daily-allowance'},
  attention: [], spending: {thisMonth: {start: '2026-09-01', end: '2026-09-18', inMinor: '0', outMinor: '1', leftMinor: '-1', tier: 'recorded'}, lastMonth: {start: '2026-08-01', end: '2026-08-31', inMinor: '0', outMinor: '0', leftMinor: '0', tier: 'recorded'},
    categories: [], billsYearlyMinor: '0', billCount: 0, smallMinor: '0', feesMinor: '0', refundsMinor: '0'},
  plan: null, goals: [], advice: [], triage: false, facts: [{fact: 'today.spend', minor: '4000'}, {fact: 'today.keep', minor: '1500'}],
} satisfies BrainSummary;

type Sent = {url: string; headers: Record<string, string>; body: Record<string, unknown>};
/** A stand-in for the network: records what was sent and answers with a canned reply. */
function server(reply: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const s = {url: String(input instanceof Request ? input.url : input), headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>};
    sent.push(s);
    return reply(s);
  };
  return {fetch, sent};
}
const message = (text: string, stop = 'end_turn', model = 'claude-opus-5') => new Response(JSON.stringify({
  id: 'msg_1', type: 'message', role: 'assistant', model, content: [{type: 'text', text}], stop_reason: stop, stop_sequence: null,
  usage: {input_tokens: 1000, output_tokens: 200}}), {status: 200, headers: {'content-type': 'application/json'}});
const error = (status: number, type: string) => new Response(JSON.stringify({type: 'error', error: {type, message: type}}), {status, headers: {'content-type': 'application/json'}});
const points = (list: {text: string; facts: string[]}[]) => JSON.stringify({points: list});

describe('the Claude advisor', () => {
  it('returns cited points and what they cost', async () => {
    const net = server(() => message(points([{text: 'Keep $15 today.', facts: ['today.keep']}])));
    const result = await review(summary, 'sk-test', 'claude-opus-5', {fetch: net.fetch, maxRetries: 0});
    expect(result).toEqual({ok: true, value: [{text: 'Keep $15 today.', facts: ['today.keep']}],
      usage: {model: 'claude-opus-5', inputTokens: 1000, outputTokens: 200, costMicros: 10000n}});
    expect(net.sent[0]!.url).toContain('/v1/messages');
    expect(net.sent[0]!.headers['x-api-key']).toBe('sk-test');
  });

  it('drops points that cite facts the summary does not hold', async () => {
    const net = server(() => message(points([{text: 'Invented.', facts: ['balance.secret']}, {text: 'Real.', facts: ['today.spend']}, {text: 'Uncited.', facts: []}])));
    const result = await ask(summary, 'Can I buy a coffee?', 'sk', 'claude-sonnet-5', {fetch: net.fetch, maxRetries: 0});
    expect(result.ok && result.value.map(p => p.text)).toEqual(['Real.']);
  });

  it('reports a refusal without reading the content', async () => {
    const net = server(() => message(points([{text: 'x', facts: ['today.spend']}]), 'refusal'));
    expect(await review(summary, 'sk', 'claude-opus-5', {fetch: net.fetch, maxRetries: 0})).toMatchObject({ok: false, reason: 'refused'});
  });

  it.each([[401, 'authentication_error', 'key'], [403, 'permission_error', 'key'], [429, 'rate_limit_error', 'busy'], [529, 'overloaded_error', 'busy'], [400, 'invalid_request_error', 'invalid']] as const)(
    'maps HTTP %i to %s → %s', async (status, type, reason) => {
      const net = server(() => error(status, type));
      expect(await review(summary, 'sk', 'claude-opus-5', {fetch: net.fetch, maxRetries: 0})).toEqual({ok: false, reason, usage: null});
    });

  it('says offline when the phone cannot connect', async () => {
    const net = server(() => { throw new TypeError('Network request failed'); });
    expect(await review(summary, 'sk', 'claude-opus-5', {fetch: net.fetch, maxRetries: 0})).toEqual({ok: false, reason: 'offline', usage: null});
  });

  it('calls a non-JSON or truncated answer invalid', async () => {
    for (const reply of [() => message('not json'), () => message(points([{text: 'x', facts: ['today.spend']}]), 'max_tokens')]) {
      const net = server(reply);
      expect(await review(summary, 'sk', 'claude-opus-5', {fetch: net.fetch, maxRetries: 0})).toMatchObject({ok: false, reason: 'invalid'});
    }
  });

  it('sends per-model settings: Opus adaptive, medium, fallback; Sonnet adaptive; Haiku neither', async () => {
    const bodies: Record<string, Sent> = {};
    for (const model of ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as AdvisorModel[]) {
      const net = server(() => message(points([{text: 'x', facts: ['today.spend']}]), 'end_turn', model));
      await review(summary, 'sk', model, {fetch: net.fetch, maxRetries: 0});
      bodies[model] = net.sent[0]!;
    }
    expect(bodies['claude-opus-5']!.body).toMatchObject({thinking: {type: 'adaptive'}, output_config: {effort: 'medium', format: {type: 'json_schema'}}, fallbacks: 'default', max_tokens: 16000});
    expect(bodies['claude-opus-5']!.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(bodies['claude-sonnet-5']!.body).toMatchObject({thinking: {type: 'adaptive'}});
    expect(bodies['claude-sonnet-5']!.body).not.toHaveProperty('fallbacks');
    expect(bodies['claude-haiku-4-5']!.body).not.toHaveProperty('thinking');
    expect(bodies['claude-haiku-4-5']!.body['output_config']).not.toHaveProperty('effort');
    expect(bodies['claude-haiku-4-5']!.body).not.toHaveProperty('stream');
  });

  it('sends only the summary', async () => {
    const net = server(() => message(points([{text: 'x', facts: ['today.spend']}])));
    await review(summary, 'sk', 'claude-opus-5', {fetch: net.fetch, maxRetries: 0});
    const content = (net.sent[0]!.body['messages'] as {content: string}[])[0]!.content;
    expect(JSON.parse(content)).toEqual({task: 'review', summary});
  });

  it('prices each model in micro-dollars', () => {
    expect([costMicros('claude-opus-5', 1_000_000, 0), costMicros('claude-sonnet-5', 0, 1_000_000), costMicros('claude-haiku-4-5', 1000, 1000)])
      .toEqual([5_000_000n, 10_000_000n, 6000n]);
  });
});

describe('sorting categories', () => {
  const merchants = Array.from({length: 160}, (_, i) => ({id: `m${i}`, description: `Shop ${i}`, direction: 'out' as const, band: 'under 10', count: 1, mcc: null, category: null}));
  it('sends at most 150 merchants a request and keeps only known ids and categories', async () => {
    const net = server(sent => {
      const asked = (JSON.parse((sent.body['messages'] as {content: string}[])[0]!.content) as {merchants: {id: string}[]}).merchants;
      return message(JSON.stringify({answers: [...asked.map(m => ({id: m.id, category: 'Shopping', confidence: 'high'})),
        {id: 'm999', category: 'Shopping', confidence: 'high'}, {id: asked[0]!.id, category: 'Nonsense', confidence: 'high'}]}));
    });
    const result = await categorise({merchants, examples: []}, ['Shopping', 'Groceries'], 'sk', 'claude-opus-5', {fetch: net.fetch, maxRetries: 0});
    expect(net.sent.map(s => (JSON.parse((s.body['messages'] as {content: string}[])[0]!.content) as {merchants: unknown[]}).merchants.length)).toEqual([150, 10]);
    expect(result.ok && result.value.length).toBe(160);
    expect(result.ok && result.usage.costMicros).toBe(20000n);
    const schema = (net.sent[0]!.body['output_config'] as {format: {schema: {properties: {answers: {items: {properties: {category: {enum: string[]}}}}}}}}).format.schema;
    expect(schema.properties.answers.items.properties.category.enum).toEqual(['Shopping', 'Groceries']);
  });
});

describe('the advisor module', () => {
  it('loads the SDK lazily, so it stays out of the main bundle', () => {
    const source = readFileSync('src/core/net/claude.ts', 'utf8');
    expect(source).not.toMatch(/^import (?!type)[^;]*'@anthropic-ai\/sdk'/m);
    expect(source).toContain("await import('@anthropic-ai/sdk')");
  });
  it('keeps Capacitor from logging request bodies', () => {
    expect(readFileSync('capacitor.config.ts', 'utf8')).toMatch(/loggingBehavior:\s*'none'/);
  });
});

import {beforeEach, describe, expect, it, vi} from 'vitest';

const cap = vi.hoisted(() => ({native: true, request: vi.fn()}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {isNativePlatform: () => cap.native},
  CapacitorHttp: {request: (options: unknown) => cap.request(options)},
}));
const {nativeFetch, review, TIMEOUT_MS} = await import('../src/core/net/claude');
beforeEach(() => { cap.native = true; cap.request.mockReset(); });

const reply = (data: unknown, status = 200) => cap.request.mockResolvedValue({status, url: 'https://api.anthropic.com/v1/messages', headers: {'content-type': 'application/json'}, data});

describe('the phone’s transport to Claude', () => {
  it('sends method, headers, body and both timeouts to the native client', async () => {
    reply('{"ok":true}');
    await nativeFetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers: {'x-api-key': 'sk'}, body: JSON.stringify({a: 1})});
    expect(cap.request).toHaveBeenCalledWith(expect.objectContaining({method: 'POST', url: 'https://api.anthropic.com/v1/messages',
      headers: expect.objectContaining({'x-api-key': 'sk'}), data: {a: 1}, connectTimeout: 15000, readTimeout: TIMEOUT_MS}));
  });

  it('hands back the status, headers and body as text, whether the native client parsed it or not', async () => {
    reply({id: 'm', n: 2}, 529);
    const parsed = await nativeFetch('https://api.anthropic.com/v1/messages', {method: 'POST', body: '{}'});
    expect([parsed.status, parsed.headers.get('content-type'), await parsed.text()]).toEqual([529, 'application/json', '{"id":"m","n":2}']);
    reply('{"raw":1}');
    expect(await (await nativeFetch('https://api.anthropic.com/v1/messages')).text()).toBe('{"raw":1}');
  });

  it('never starts a cancelled request, and stops one cancelled while waiting', async () => {
    const early = new AbortController(); early.abort();
    await expect(nativeFetch('https://api.anthropic.com/v1/messages', {signal: early.signal})).rejects.toMatchObject({name: 'AbortError'});
    expect(cap.request).not.toHaveBeenCalled();
    cap.request.mockReturnValue(new Promise(() => undefined));
    const late = new AbortController();
    const pending = nativeFetch('https://api.anthropic.com/v1/messages', {signal: late.signal});
    late.abort();
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
  });

  it('carries a whole review on the phone without touching the WebView’s fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    reply({id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', stop_reason: 'end_turn', stop_sequence: null, usage: {input_tokens: 10, output_tokens: 5},
      content: [{type: 'text', text: JSON.stringify({points: [{text: 'Fine.', facts: ['today.spend']}]})}]});
    const summary = {facts: [{fact: 'today.spend', minor: '1'}]} as unknown as Parameters<typeof review>[0];
    expect(await review(summary, 'sk', 'claude-haiku-4-5', {maxRetries: 0})).toMatchObject({ok: true, value: [{text: 'Fine.'}]});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

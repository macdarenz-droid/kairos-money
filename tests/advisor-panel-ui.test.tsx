// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {currency} from '../src/core/money';
import {summary, think} from '../src/brain';
import type {AdvisorCall} from '../src/core/db/privacy';
import type {Transaction} from '../src/intelligence/model';
import {brainInputs} from './brain-mock';
import {AdvisorPanel} from '../src/ui/advisor/AdvisorPanel';

const state = vi.hoisted(() => ({enabled: true, key: 'sk-ant-synthetic-0123456789abcdef' as string | null, calls: [] as AdvisorCall[]}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => unknown) => Promise.resolve(fn({advisor: {
  settings: () => Promise.resolve({enabled: state.enabled, model: 'claude-sonnet-5', merchantNames: false, sortConsent: false, autoSort: false}),
  key: () => Promise.resolve(state.key)}, privacy: {logAdvisorCall: (c: AdvisorCall) => { state.calls.push(c); return Promise.resolve(); }}}))})}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.calls = []; state.enabled = true; });
const AUD = currency('AUD'), today = '2026-09-18';
const t = (id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction => ({id, accountId: 'secret-account', date, minor, currency: AUD,
  description: 'Private Clinic', category: 'Health', kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over});
const brain = think(brainInputs({asOf: today, currency: AUD, accountIds: ['secret-account'], coverage: [], pays: [], savings: {asideMinor: '0', accountIds: [], evidence: []},
  transactions: [t('pay', '2026-09-01', '300000', {kind: 'income', category: 'Salary', description: 'Employer'}), t('tx-secret', '2026-09-10', '-5000')]},
  {accounts: [{id: 'secret-account', currency: 'AUD'}], balances: [{accountId: 'secret-account', minor: '400000'}]}));
const answer = (body: object, stop = 'end_turn') => vi.fn(async () => new Response(JSON.stringify({id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: stop, stop_sequence: null,
  usage: {input_tokens: 1000, output_tokens: 100}, content: [{type: 'text', text: JSON.stringify(body)}]}), {status: 200, headers: {'content-type': 'application/json'}}));
const mount = () => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><AdvisorPanel brain={brain}/></QueryClientProvider>);

it('stays hidden while the advisor is off', async () => {
  state.enabled = false;
  mount();
  await new Promise(r => setTimeout(r, 50));
  expect(screen.queryByLabelText('Kairos AI')).toBeNull();
});

it('shows a cited money review as AI wording and logs the call', async () => {
  const fact = summary(brain).facts[0]!.fact;
  vi.stubGlobal('fetch', answer({points: [{text: 'You spent less this month.', facts: [fact]}, {text: 'Made up.', facts: ['no.such.fact']}]}));
  mount();
  fireEvent.click(await screen.findByRole('button', {name: 'Money review'}));
  await screen.findByText('You spent less this month.');
  expect(screen.getByText('AI wording')).toBeTruthy();
  expect(screen.queryByText('Made up.')).toBeNull();
  expect(state.calls).toMatchObject([{model: 'claude-sonnet-5', inputTokens: 1000, outputTokens: 100, result: 'ok'}]);
  expect(screen.getByText(/^This call cost about .*0\.01\.$/)).toBeTruthy();
});

it('falls back to local advice on a refusal', async () => {
  vi.stubGlobal('fetch', answer({points: []}, 'refusal'));
  mount();
  fireEvent.change(await screen.findByLabelText('Ask Kairos'), {target: {value: 'Can I afford a holiday?'}});
  fireEvent.click(screen.getByRole('button', {name: 'Ask'}));
  await screen.findByText('Kairos AI declined this request. The advice above is from your own figures.');
  expect(state.calls.map(c => c.result)).toEqual(['refused']);
});

it('shows exactly what is sent, with no ids, accounts or descriptions', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', {name: 'See exactly what is sent'}));
  const sent = (await screen.findByLabelText('What is sent')).textContent ?? '';
  expect(sent).toContain('"facts"');
  for (const secret of ['secret-account', 'tx-secret', 'Private Clinic', 'PRIVATE CLINIC']) expect(sent).not.toContain(secret);
});

it('shows Kairos AI working during a slow call and removes it after', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const reply = answer({points: [{text: 'You spent less this month.', facts: [summary(brain).facts[0]!.fact]}]});
  vi.stubGlobal('fetch', vi.fn(async () => { await gate; return reply(); }));
  mount();
  fireEvent.click(await screen.findByRole('button', {name: 'Money review'}));
  expect(await screen.findByRole('status', {name: 'Kairos AI is writing your answer'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Asking Kairos AI…'}).getAttribute('aria-busy')).toBe('true');
  release();
  await screen.findByText('You spent less this month.');
  expect(screen.queryByRole('status', {name: 'Kairos AI is writing your answer'})).toBeNull();
});

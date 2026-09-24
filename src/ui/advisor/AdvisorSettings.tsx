import {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ADVISOR_MODELS, type AdvisorSettings as Settings} from '../../ledger/advisor';
import {Button, Input, Row} from '../design/primitives';
import {useSession} from '../session';
import {SortCategories} from './SortCategories';

const MODEL_NAMES: Record<Settings['model'], string> = {'claude-opus-5': 'Opus 5 · best', 'claude-sonnet-5': 'Sonnet 5', 'claude-haiku-4-5': 'Haiku 4.5 · cheapest'};

export function useAdvisor() {
  const session = useSession();
  return useQuery({queryKey: ['advisor'], enabled: session.state === 'ready',
    queryFn: () => session.run(async repo => ({settings: await repo.advisor.settings(), hasKey: (await repo.advisor.key()) !== null}))});
}

/** Settings › Claude advisor. Off by default; the key stays on this phone. */
export function AdvisorSettings() {
  const session = useSession(), client = useQueryClient(), advisor = useAdvisor();
  const [key, setKey] = useState(''), [error, setError] = useState(''), [sorting, setSorting] = useState(false);
  if (session.state !== 'ready' || !advisor.data) return null;
  const {settings, hasKey} = advisor.data;
  const done = () => client.invalidateQueries({queryKey: ['advisor']});
  const act = (work: () => Promise<unknown>) => { setError(''); void work().then(done).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); };
  const change = (next: Partial<Settings>) => act(() => session.run(repo => repo.advisor.save({...settings, ...next})));
  const toggle = (label: string, on: boolean, flip: () => void, disabled = false) =>
    <Button aria-pressed={on} disabled={disabled} onClick={flip}>{label}: {on ? 'On' : 'Off'}</Button>;
  return <section className="settings-section" aria-label="Claude advisor">
    <h2>Claude advisor</h2>
    <p className="meta">Optional. Uses your own Anthropic key and account.</p>
    {toggle('Use the Claude advisor', settings.enabled, () => change({enabled: !settings.enabled}))}
    {hasKey
      ? <Row trailing={<Button onClick={() => act(() => session.run(repo => repo.advisor.clearKey()))}>Remove key</Button>}>Key saved on this phone</Row>
      : <><Input label="Anthropic API key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} hint="Kept on this phone only. Never in backups."/>
        <Button disabled={!key.trim()} onClick={() => act(() => session.run(repo => repo.advisor.setKey(key)).then(() => setKey('')))}>Save key</Button></>}
    <label className="input-label">Model<select value={settings.model} onChange={e => change({model: e.target.value as Settings['model']})}>
      {ADVISOR_MODELS.map(m => <option key={m} value={m}>{MODEL_NAMES[m]}</option>)}</select></label>
    {toggle('Include merchant names in reviews', settings.merchantNames, () => change({merchantNames: !settings.merchantNames}))}
    {toggle('Send merchant names to Claude for sorting', settings.sortConsent, () => change({sortConsent: !settings.sortConsent, ...(settings.sortConsent ? {autoSort: false} : {})}))}
    {toggle('Sort new merchants after each import', settings.autoSort, () => change({autoSort: !settings.autoSort}), !settings.sortConsent)}
    <Button disabled={!settings.enabled || !hasKey || !settings.sortConsent} onClick={() => setSorting(true)}>Sort my categories</Button>
    {error && <p role="alert">{error}</p>}
    {sorting && <SortCategories onClose={() => setSorting(false)}/>}
  </section>;
}

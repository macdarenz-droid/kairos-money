import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Vault } from '../../core/crypto/native';
import { Button, Input } from '../design/primitives';
import { useSession } from '../session';

export function AiSettings() {
  const session = useSession(), client = useQueryClient();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => Vault.aiStatus(), enabled: session.state === 'ready' });
  const [apiKey, setApiKey] = useState(''), [model, setModel] = useState('gpt-4o-mini'), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { if (status.data?.model) setModel(status.data.model); }, [status.data?.model]);
  async function save() {
    setBusy(true); setMessage(''); setError('');
    try { await Vault.configureAi({ apiKey, model }); setApiKey(''); await client.invalidateQueries({ queryKey: ['ai-status'] }); setMessage('Assistant settings saved on this device.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Assistant settings could not be saved.'); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setMessage(''); setError('');
    try { await Vault.clearAi(); setApiKey(''); setModel('gpt-4o-mini'); await client.invalidateQueries({ queryKey: ['ai-status'] }); setMessage('The API key was removed.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The API key could not be removed.'); }
    finally { setBusy(false); }
  }
  return <div className="stack ai-settings">
    <p>{status.data?.configured ? 'An OpenAI API key is saved in encrypted device storage.' : 'Add an OpenAI API key to use natural-language questions and transaction category suggestions.'}</p>
    <Input label="OpenAI API key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status.data?.configured ? 'Leave blank to keep the saved key' : 'Paste API key'}/>
    <Input label="Model" value={model} onChange={event => setModel(event.target.value)} placeholder="gpt-4o-mini" hint="OpenAI chat-completions model name."/>
    <div className="form-actions"><Button disabled={busy || session.state !== 'ready'} onClick={() => void save()}>{busy ? 'Saving…' : 'Save assistant settings'}</Button>{status.data?.configured && <Button variant="danger" disabled={busy} onClick={() => void clear()}>Remove API key</Button>}</div>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </div>;
}

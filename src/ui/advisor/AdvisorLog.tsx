import {useQuery} from '@tanstack/react-query';
import {Row} from '../design/primitives';
import {useSession} from '../session';
import {usd} from './cost';

/** Every Claude call: when, which model, tokens and cost. Nothing else is recorded. */
export function AdvisorLog() {
  const session = useSession();
  const calls = useQuery({queryKey: ['advisor-calls'], enabled: session.state === 'ready', queryFn: () => session.run(repo => repo.privacy.advisorCalls())});
  const list = calls.data ?? [];
  return <section className="stack" aria-label="Claude calls">
    <h3>{list.length ? `${list.length} Claude ${list.length === 1 ? 'call' : 'calls'}` : 'No Claude calls'}</h3>
    {list.map(c => <Row key={c.id} trailing={usd(c.costMicros)}>{c.at.slice(0, 16).replace('T', ' ')} · {c.model}
      <p className="meta">{c.inputTokens + c.outputTokens} tokens · {c.result === 'ok' ? 'answered' : c.result}</p></Row>)}
  </section>;
}

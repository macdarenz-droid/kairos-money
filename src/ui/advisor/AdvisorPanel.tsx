import {useState} from 'react';
import type {Brain, BrainSummary} from '../../brain/types';
import type {Point} from '../../core/net/claude';
import {Button, Input, Surface} from '../design/primitives';
import {ClaudeWorking} from '../design/Motion';
import {useSession} from '../session';
import {useAdvisor} from './AdvisorSettings';
import {usd} from './cost';
import {consult, sentSummary} from './review';
import {REASONS, type SortReason} from './sort';

/** Money review and Ask Kairos, on Insights. Figures stay the brain's; Claude's text is marked "AI wording". */
export function AdvisorPanel({brain}: {brain: Brain}) {
  const session = useSession(), advisor = useAdvisor();
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [points, setPoints] = useState<Point[]>([]);
  const [cost, setCost] = useState(''), [failure, setFailure] = useState<SortReason | ''>(''), [sent, setSent] = useState<BrainSummary | null>(null);
  if (!advisor.data?.settings.enabled || !advisor.data.hasKey) return null;
  async function go(q: string | null) {
    setBusy(true); setFailure(''); setPoints([]); setCost('');
    try {
      const result = await consult(session.run, brain, q);
      if (result.usage) setCost(usd(result.usage.costMicros));
      if (result.ok) setPoints(result.value); else setFailure(result.reason);
    } catch { setFailure('invalid'); } finally { setBusy(false); }
  }
  const toggleSent = () => { if (sent) setSent(null); else void sentSummary(session.run, brain).then(setSent); };
  return <section className="stack" aria-label="Claude advisor" data-slot="advisor">
    <h2>Claude advisor</h2>
    <Button onClick={() => void go(null)} busy={busy} busyLabel="Asking Claude…">Money review</Button>
    <Input label="Ask Kairos" value={question} maxLength={300} onChange={e => setQuestion(e.target.value)} hint="Answers use only your figures."/>
    <Button disabled={busy || !question.trim()} onClick={() => void go(question)}>Ask</Button>
    {busy && <ClaudeWorking kind="review"/>}
    <Button variant="quiet" aria-expanded={sent !== null} onClick={toggleSent}>See exactly what is sent</Button>
    {sent && <pre className="payload" aria-label="What is sent">{JSON.stringify(sent, null, 2)}</pre>}
    {points.length > 0 && <Surface className="advisor-points"><span className="tag">AI wording</span>
      {points.map(p => <p key={p.text}>{p.text}</p>)}</Surface>}
    {failure && <p role="alert">{REASONS[failure]} The advice above is from your own figures.</p>}
    {cost && <p className="meta">This call cost about {cost}.</p>}
  </section>;
}

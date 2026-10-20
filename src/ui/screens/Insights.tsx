import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CircleAlert, Sparkles } from 'lucide-react';
import { Vault } from '../../core/crypto/native';
import { format, money } from '../../core/money';
import type { Account } from '../../core/db/repository';
import type { Batch, LedgerRow } from '../../ingest/types';
import { askMoney, type QuestionResult } from '../../ai/assistant';
import { moneyOutlook } from '../../ledger/outlook';
import { Button, Row } from '../design/primitives';
import { useSession } from '../session';

export function Insights({ accounts, batches, rows, today, onConfigure }: { accounts: Account[]; batches: Batch[]; rows: LedgerRow[]; today: string; onConfigure: () => void }) {
  const outlook = moneyOutlook(rows, accounts, batches, today);
  return <div className="stack insight-content">
    <section><div className="insight-heading"><h2>Cash-flow outlook</h2><CalendarClock size={18}/></div><p>Thirty-day estimates from recent settled activity in checking, savings and cash accounts.</p>
      {outlook.forecasts.length ? outlook.forecasts.map(item => <div className="forecast-card" key={item.currency}>
        <p className="meta">{item.currency} · based on {item.coveredDays} covered days through {item.asOf}</p>
        <Row trailing={<strong>{format(money(item.safeToSpend, item.currency))}</strong>}>Estimated safe to spend<p>After projected spending and a one-week spending buffer</p></Row>
        <Row trailing={<span>{format(money(item.current, item.currency))}</span>}>Liquid balance from covered data</Row>
        <Row trailing={<span>{format(money(item.income30, item.currency))}</span>}>Projected income · next 30 days</Row>
        <Row trailing={<span>{format(money(-item.spending30, item.currency))}</span>}>Projected spending · next 30 days</Row>
        <Row trailing={<span>{format(money(-item.commitments, item.currency))}</span>}>Pending commitments</Row>
        <Row trailing={<span>{format(money(item.current + item.income30 - item.spending30 - item.commitments, item.currency))}</span>}>Projected balance in 30 days</Row>
      </div>) : <div className="outlook-empty"><p>There is not enough recent statement coverage for a useful forecast. Import at least 45 covered days from the last 90, update an account in the past week, and include a verified statement closing balance.</p></div>}
      {outlook.excludedAccounts.length > 0 && <p className="meta">Not included because coverage is incomplete, out of date or lacks a verified closing balance: {outlook.excludedAccounts.join(', ')}.</p>}
      <p className="meta">Starts from a verified closing balance and adds subsequent covered transactions. Assumes recent income and spending continue at the same pace, subtracts known pending commitments and keeps a one-week spending buffer. This is a scenario, not a promise. Credit, loan and investment accounts are excluded.</p>
    </section>
    <section><div className="insight-heading"><h2>Patterns to check</h2><CircleAlert size={18}/></div>
      {outlook.recurring.length ? <>{outlook.recurring.map(item => <Row key={`${item.accountId}:${item.merchant}:${item.currency}`} trailing={<span>{format(money(-item.amount, item.currency))}</span>}>{item.merchant}<p>Possible {item.cadence} payment · next around {item.nextDate}</p></Row>)}</> : <p className="meta">Possible recurring payments need at least three similar charges on a steady schedule.</p>}
      {outlook.unusual.map(item => <Row key={item.row.id} trailing={<span>{format(money(BigInt(item.row.minor), item.row.currency))}</span>}><span className="insight-alert"><CircleAlert size={14}/>{item.row.merchant}</span><p>{item.row.date} · about twice its usual amount of {format(money(-item.baseline, item.row.currency))}</p></Row>)}
    </section>
    <AskMoney rows={rows} accounts={accounts} today={today} onConfigure={onConfigure}/>
    <p className="meta">Kairos calculates totals and projections from imported records. AI turns your question into a read-only query and suggests transaction categories; it cannot edit your ledger.</p>
  </div>;
}

function AskMoney({ rows, accounts, today, onConfigure }: { rows: LedgerRow[]; accounts: Account[]; today: string; onConfigure: () => void }) {
  const session = useSession();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => Vault.aiStatus(), enabled: session.state === 'ready', staleTime: 30000 });
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState<QuestionResult | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(value = question) {
    setBusy(true); setError(''); setAnswer(null);
    try { setAnswer(await askMoney(value, rows, accounts, today)); setQuestion(value); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The assistant could not answer that question.'); }
    finally { setBusy(false); }
  }
  return <section className="ask-money"><div className="insight-heading"><div><h2>Ask about your money</h2><p>Ask a question; Kairos checks the matching transactions.</p></div><Sparkles size={18}/></div>
    {status.data?.configured ? <>
      <textarea className="ai-question" aria-label="Ask about your money" rows={3} maxLength={500} placeholder="How much did I spend on groceries last month?" value={question} onChange={event => setQuestion(event.target.value)}/>
      <div className="question-examples">{['How much did I spend on groceries last month?', 'What were my top spending categories this month?', 'What were my largest purchases this month?'].map(example => <button key={example} type="button" className="example-question" onClick={() => void submit(example)}>{example}</button>)}</div>
      <Button variant="primary" disabled={busy || !question.trim()} onClick={() => void submit()}>{busy ? 'Checking your ledger…' : 'Ask Kairos'}</Button>
    </> : <><p>{status.isPending ? 'Checking assistant settings…' : 'Connect an OpenAI model in Settings to ask questions or request category suggestions.'}</p><Button onClick={onConfigure}>Set up the assistant</Button></>}
    {status.error && <p role="alert" className="error">AI settings could not be read. Lock and reopen Kairos before continuing.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {answer && <section className="answer-card" aria-live="polite"><p className="meta">{answer.start}–{answer.end} · {answer.count} {answer.count === 1 ? 'transaction' : 'transactions'}</p><h3>{answer.title}</h3>
      {answer.metric === 'transactions' && <p>{answer.count} matching transactions.</p>}
      {answer.metric === 'largest_transactions' && <p>Largest settled purchases, sorted by amount.</p>}
      {(answer.metric === 'spending' || answer.metric === 'income') && (answer.totals.length ? answer.totals.map(item => <p className="answer-total" key={item.currency}>{item.currency} {format(money(item.minor, item.currency))}</p>) : <p>No matching {answer.metric === 'spending' ? 'spending' : 'income'} in the ledger for that period.</p>)}
      {answer.metric === 'top_categories' && (answer.categories.length ? answer.categories.map(item => <Row key={`${item.currency}:${item.name}`} trailing={<span>{format(money(-item.minor, item.currency))}</span>}>{item.name}</Row>) : <p>No categorised spending was found in the ledger for that period.</p>)}
      {answer.evidence.length > 0 && <><p className="meta">Matching records</p>{answer.evidence.map(({ row, accountName }) => <Row key={row.id} trailing={<span>{format(money(BigInt(row.minor), row.currency))}</span>}>{row.merchant}<p>{row.date} · {accountName}{row.category ? ` · ${row.category}` : ''}</p></Row>)}</>}
      <p className="meta">Transactions are settled, non-transfer ledger entries. Pending items and internal transfers are excluded.</p>
    </section>}
  </section>;
}

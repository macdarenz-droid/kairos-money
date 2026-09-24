import {Refunds} from './Refunds';
import {ManualSheet} from './Manual';
import type {ManualEntry} from '../../ledger/manual';
import {CategoryMark, relativeDay} from '../design/CategoryMark';
import {localDay} from '../../ingest/reminders';
import {ForeignCurrency} from './ForeignCurrency';
import {TransactionSplits} from './TransactionSplits';
import {TransactionAttachments} from './TransactionAttachments';
import {BulkCategories} from './BulkCategories';
import { ImportProgress } from '../design/ImportProgress';
import { BusyOverlay, KairosAiMark } from '../design/Motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, FileCheck2 } from 'lucide-react';
import type { Account, Repository } from '../../core/db/repository';
import { currency, currencyDigits, format, money } from '../../core/money';
import { FileSource, MappingRequired, type ExportMapping } from '../../ingest/sources';
import { PeriodTooNarrow } from '../../ingest/types';
import { tierLabel } from '../../ingest/integrity';
import { importResultSentence } from '../../ingest/freshness';
import { Backup } from './Backup';
import { ColumnMapping } from './ColumnMapping';
import { decodeFile, selectFiles, stageDroppedFiles } from '../../ingest/review/files';
import { sortAfterImport } from '../advisor/sort';
import { AiCategoryFix } from '../advisor/AiCategoryFix';
import { merchantName, normalizeAmount } from '../../ingest/normalize';
import { coverage, coveredDays, gaps } from '../../ingest/reconcile';
import type { BatchSummary, ImportContext, LedgerRow, NormalizedRow } from '../../ingest/types';
import { ImportFailure } from '../../ingest/types';
import { payMetrics } from '../../ledger/payslips';
import { categoryNames } from '../../ledger/categories';
import { Amount, Button, EmptyState, Input, Row, Sheet } from '../design/primitives';
import { useSession } from '../session';
import { useConverter } from '../currency';
/** Rows shown before the first press, then how many each press adds. */
const FIRST = 5, MORE = 10;
function decimalString(minor: string, code: string): string { const value = BigInt(minor), digits = currencyDigits[currency(code)], unit = 10n ** BigInt(digits), absolute = value < 0n ? -value : value; return `${value < 0n ? '-' : ''}${absolute / unit}${digits ? '.' + (absolute % unit).toString().padStart(digits, '0') : ''}`; }
type Review = Awaited<ReturnType<Repository['imports']['review']>>;
/** Five, because he asked for five: a short list you step through beats a wall you scroll. */
/**
 * TEN ROWS A PRESS, NOT FIVE WITH A PAGER.
 *
 * Five rows and Previous/Next made 74 pages of his own history, with the count wedged between the two
 * buttons — which is what he marked. Baymard's mobile testing puts "load more" ahead of classic paging
 * on a phone, and it disposes of the page-jump control nobody wants to use with a thumb.
 *
 * The request shape is unchanged: one page per press, so the native bridge still answers with one page
 * rather than the whole ledger. That limit is what tests/query-pages.test.ts exists to hold.
 *
 * TEN AND NOT TWENTY-FIVE, BECAUSE THE DEVICE SAID SO. At 25 the 20,000-row gate measured 10,102 ms
 * against a 10,000 ms budget: the page query cost 538 ms across its three calls while the screen was
 * already waiting on the whole-ledger analysis behind it. The budget is not up for renegotiation, so the
 * page is the thing that moves. Ten is still twice what the pager showed and needs no page numbers.
 */
const PAGE = 10;
function Failure({ error }: { error: Error }) { return <div className="import-failure" role="alert">{error instanceof ImportFailure && <><p>{error.understood}</p><pre>{error.excerpt}</pre></>}<p>{error.message}</p></div>; }
export function ImportWorkspace({ accounts, request, consumed, accountsView }: { accounts: Account[]; request: number; consumed: () => void; accountsView?: ReactNode }) {
  const session = useSession(), query = useQueryClient();
  // A purchase converts at the rate for the day it happened, not at today's.
  const display = useConverter();
  const [fileId, setFileId] = useState<string | null>(null), [reviewId, setReviewId] = useState<string | null>(null), [transaction, setTransaction] = useState<LedgerRow | null>(null), [undo, setUndo] = useState<BatchSummary | null>(null), [search, setSearch] = useState(''), [notice, setNotice] = useState(''), [updateReview, setUpdateReview] = useState<string[] | null>(null);
  const [backupSuggested, setBackupSuggested] = useState(false), [backupOpen, setBackupOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ManualEntry | null>(null), [removeEntry, setRemoveEntry] = useState<ManualEntry | null>(null), [matchEntry, setMatchEntry] = useState<ManualEntry | null>(null), [removeError, setRemoveError] = useState(''), [entryError, setEntryError] = useState(''), [opening, setOpening] = useState(false);
  const [removeNotice, setRemoveNotice] = useState<{id: string; description: string} | null>(null), [removeNoticeError, setRemoveNoticeError] = useState('');
  /**
   * READ THE ENTRY AT THE MOMENT OF ACTING ON IT, NOT FROM A CACHE.
   *
   * This used to read a cached list, and that cache is what made Edit do nothing on the second
   * hand-recorded transaction while working perfectly on the first. The query was only enabled while a
   * hand-recorded row was open, so saving a new entry invalidated a DISABLED query — which React Query
   * marks stale and does not refetch. Opening the next row served the stale list from the first
   * transaction, the new id was not in it, and the press fell through the gap.
   *
   * It had already been a shared cache key before that, and the sheet read `.entries` off a bare array.
   * Two bugs from one cache, for a list that is three rows long and reachable in a millisecond. So there
   * is no cache: the action reads what it is about to act on, when it acts on it.
   *
   * A BUTTON THAT DOES NOTHING IS THE WORST ANSWER THIS APP CAN GIVE. "when i click confirm, nothing
   * happens" is the same complaint about a different button. Either the thing happens or the screen says
   * why it did not, and the two ways this can fail are different situations, so they get different
   * sentences.
   */
  const openManual = async (act: (entry: ManualEntry) => void) => {
    const id = transaction?.manualId;
    if (!id) return;
    setOpening(true); setEntryError('');
    try {
      const entries = await session.run(repo => repo.manual.list());
      const entry = entries.find(e => e.id === id);
      if (!entries.length) setEntryError('The transactions you recorded by hand could not be read. Close this and open it again.');
      else if (!entry) setEntryError('The entry behind this transaction is no longer there. Close this and open it again.');
      else { setTransaction(null); act(entry); }
    } catch { setEntryError('The transactions you recorded by hand could not be read. Close this and open it again.'); }
    finally { setOpening(false); }
  };
  const forget = useMutation({ mutationFn: (id: string) => session.run(repo => repo.manual.remove(id)), onSuccess: async () => { setRemoveEntry(null); await query.invalidateQueries(); }, onError: () => setRemoveError('The transaction could not be removed.') });
  /**
   * Removing an approved bank notification. There is no statement behind it to disagree with — only a
   * notification the owner approved — so unlike an imported row, it stays revocable like a hand-recorded
   * one. Deleting it clears the transaction it became, and every figure that reads the ledger (balances,
   * the intelligence engine, the money band) simply stops seeing it on its next read.
   */
  const forgetNotice = useMutation({ mutationFn: (id: string) => session.run(repo => repo.notices.remove(id)),
    onSuccess: async () => { setRemoveNotice(null); setTransaction(null); await query.invalidateQueries(); setNotice('That notification is off your ledger.'); },
    onError: e => setRemoveNoticeError(e instanceof Error ? e.message : 'That could not be removed.') });
  // Matching is what stops the same purchase being counted twice once its statement arrives, so it kept
  // its place — it only moved off the list and into the one transaction it concerns.
  const candidates = useQuery({ queryKey: ['manual-matches', matchEntry?.id], queryFn: () => session.run(repo => repo.manual.candidates(matchEntry!.id)), enabled: !!matchEntry && session.state === 'ready' });
  const link = useMutation({ mutationFn: (choice: {leg: string; transactionId: string} | null) => session.run(repo => choice ? repo.manual.match(matchEntry!.id, choice.leg, choice.transactionId) : repo.manual.unmatch(matchEntry!.id)), onSuccess: async () => { setMatchEntry(null); await query.invalidateQueries(); } });
  const [bulkOpen,setBulkOpen]=useState(false);
  function imported(message: string, added: number) {
    setNotice(message); if (added > 50) setBackupSuggested(true);
    if (added > 0) void sortAfterImport(session.run).then(async note => { if (note) { setNotice(`${message} ${note}`); await query.invalidateQueries(); } }).catch(() => undefined);
  }
  const data = useQuery({ queryKey: ['imports'], queryFn: () => session.run(repo => repo.imports.workspace()), enabled: session.state === 'ready' });
  const pick = useMutation({ mutationFn: () => session.run(selectFiles), onSuccess: async count => { setNotice(count ? `${count} ${count === 1 ? 'file' : 'files'} staged. Confirm the account and statement details for each file.` : 'No files selected.'); await query.invalidateQueries({ queryKey: ['imports'] }); } });
  const drop = useMutation({mutationFn:(files:File[])=>session.run(repo=>stageDroppedFiles(repo,files)),onSuccess:async count=>{setNotice(`${count} ${count === 1 ? 'file' : 'files'} staged in one update. Review each file before confirming.`);await query.invalidateQueries({queryKey:['imports']});}});
  const requestHandled = useRef(false);
  useEffect(() => { if (!request) requestHandled.current = false; if (request && !requestHandled.current && session.state === 'ready') { requestHandled.current = true; consumed(); pick.mutate(); } }, [request]); // Request is a one-shot navigation action.
  const rollback = useMutation({ mutationFn: (id: string) => session.run(repo => repo.imports.rollback(id)), onSuccess: async () => { setUndo(null); setBackupSuggested(false); await query.invalidateQueries(); setNotice('Import rolled back. Other statement sources are retained.'); } });
  const forgetImport = useMutation({ mutationFn: (id: string) => session.run(repo => repo.imports.forget(id)), onSuccess: async () => { await query.invalidateQueries({ queryKey: ['imports'] }); setNotice('That file is off the list.'); } });
  const batches = data.data?.batches ?? [], files = data.data?.files ?? [];
  const live = batches.filter(b => b.status !== 'rolled_back'), removed = batches.filter(b => b.status === 'rolled_back');
  // FIVE ROWS, AND A NEXT BUTTON. The list was a 20,000-row virtual scroll fed 200 rows at a time,
  // which existed because transferring the whole ledger across the native bridge measured 52,310 ms of
  // a 52,491 ms load. Paging asks for five, so that problem cannot arise at all, and a short list you
  // step through is the thing that was actually wanted.
  // Each press fetches the next page and keeps the ones already read, so the list only ever grows
  // downward — and a deleted row, an edit or a new import refetches exactly the pages on screen.
  const page = useInfiniteQuery({ queryKey: ['ledger-window', search], enabled: session.state === 'ready',
    initialPageParam: 0,
    queryFn: ({ pageParam }) => session.run(repo => repo.imports.ledgerPage(search, pageParam * PAGE, PAGE)),
    getNextPageParam: (last, pages) => pages.reduce((n, p) => n + p.rows.length, 0) < last.total ? pages.length : undefined });
  const total = page.data?.pages[0]?.total ?? 0, loaded = page.data?.pages.flatMap(p => p.rows) ?? [];
  return <section className="import-workspace" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(session.state==='ready')drop.mutate(Array.from(e.dataTransfer.files));}}>{accounts.length > 0 && <Button variant="primary" className="add-primary" disabled={pick.isPending || session.state !== 'ready'} onClick={() => pick.mutate()} busy={pick.isPending} busyLabel="Selecting files…"><FileUp size={18}/>Import statements</Button>}{accountsView}
    {(pick.isPending || drop.isPending) && <ImportProgress message="Selecting and securing your files…"/>}
    {backupSuggested && <div className="form-actions"><p>Save an encrypted backup of this import.</p><Button onClick={() => setBackupOpen(true)}>Back up</Button><Button variant="quiet" onClick={() => setBackupSuggested(false)}>Dismiss</Button></div>}
    {backupOpen && <Backup onClose={() => setBackupOpen(false)} notify={message => { setNotice(message); setBackupSuggested(false); }}/>}
    {editEntry && <ManualSheet accounts={accounts} entry={editEntry} onClose={() => setEditEntry(null)}/>}
    {matchEntry && <Sheet title="Match with statement" onClose={() => { if (!link.isPending) setMatchEntry(null); }}><div className="stack"><p>Confirm only if these are the same purchase. Similar amounts can be different transactions.</p>{candidates.data?.map(c => <Row key={c.leg + c.batchId + c.sourceId} trailing={<Button disabled={link.isPending} onClick={() => link.mutate({leg: c.leg, transactionId: c.transactionId})}>Same transaction</Button>}>{c.description}<p>{c.date} · {c.leg === 'entry' ? 'Statement transaction' : c.leg === 'from' ? 'Transfer out' : 'Transfer in'}</p></Row>)}{candidates.data && !candidates.data.length && <p>No imported entry with the same account and amount within three days.</p>}{Object.keys(matchEntry.links).length > 0 && <Button disabled={link.isPending} onClick={() => link.mutate(null)}>Remove saved matches</Button>}{(link.error || candidates.error) && <p role="alert">Matches could not be read.</p>}</div></Sheet>}
    {removeEntry && <Sheet title="Delete this transaction?" onClose={() => { if (!forget.isPending) { setRemoveEntry(null); setRemoveError(''); } }}><div className="stack"><p>{removeEntry.description}. This removes the record you typed; anything imported from a statement stays.</p>{removeError && <p role="alert">{removeError}</p>}<Button variant="danger" disabled={forget.isPending} onClick={() => forget.mutate(removeEntry.id)}>Delete transaction</Button></div></Sheet>}
    {removeNotice && <Sheet title="Delete this transaction?" onClose={() => { if (!forgetNotice.isPending) { setRemoveNotice(null); setRemoveNoticeError(''); } }}><div className="stack"><p>{removeNotice.description}. This removes the notification you approved; nothing here was ever confirmed by a statement.</p>{removeNoticeError && <p role="alert">{removeNoticeError}</p>}<Button variant="danger" disabled={forgetNotice.isPending} onClick={() => forgetNotice.mutate(removeNotice.id)}>Delete transaction</Button></div></Sheet>}
    
    {notice && <p role="status" className="notice">{notice}</p>}{pick.error && <Failure error={pick.error}/>} {drop.error && <Failure error={drop.error}/>}{data.error && <Failure error={data.error}/>}
    {/* ONE HISTORY. Money recorded by hand, money a bank notification announced and money read off a
        statement were three lists in three places, and the manual one carried five controls per row —
        receipts, splits, edit, match, delete — stacked under every entry. A purchase is not a different
        KIND of thing because of how it reached the app, and a list is for finding one, not for acting
        on all of them. The row says what it was, when, and how much. Everything else is one tap away. */}
    <section className="section-gap"><div className="list-heading history-heading"><div><h2>History</h2>{!!total&&<p className="meta">{total} {total === 1 ? 'transaction' : 'transactions'}</p>}</div>{!!total&&<Button variant="quiet" onClick={()=>setBulkOpen(true)}>Change categories</Button>}</div><Input label="Search history" placeholder="Merchant, date or category" value={search} onChange={e => setSearch(e.target.value)}/>{total ? <>{loaded.map(row => <button type="button" className="transaction-row" key={row.id} onClick={() => { setEntryError(''); setTransaction(row); }}><span className="row-lead"><CategoryMark description={row.merchant} category={row.transferGroup ? 'Transfer' : row.category}/><span><strong>{row.merchant}</strong><span className="meta">{relativeDay(row.date, localDay())} · {row.pending ? 'Pending · ' : ''}{row.manualId ? 'Recorded by hand' : row.transferGroup ? 'Internal transfer' : row.category ?? 'Uncategorised'}{row.categoryFrom === 'ai' && !row.transferGroup && <> <KairosAiMark size={12} label="Sorted by Kairos AI"/></>}</span></span></span><Amount value={display.into(row.minor, row.currency, row.date) ?? money(BigInt(row.minor), row.currency)} context={row.merchant}/></button>)}{page.hasNextPage && <div className="load-more"><p className="meta">Showing {loaded.length} of {total}</p><Button className="full-width" onClick={() => void page.fetchNextPage()} busy={page.isFetchingNextPage} busyLabel="Loading…">Load more</Button></div>}</> : !accounts.length ? null : <EmptyState icon={<FileCheck2 size={24}/>} title={search ? 'No matching transactions' : 'No transactions yet'} action={search ? <Button onClick={() => setSearch('')}>Clear search</Button> : undefined}>Import a statement, review its rows, then confirm the import.</EmptyState>}</section>
    {/* ROLLING BACK REBUILDS THE WHOLE LEDGER, which on a few hundred rows is long enough that a screen
        with no sign of life reads as a frozen app. */}
    {(rollback.isPending || forgetImport.isPending) && <BusyOverlay message={rollback.isPending ? 'Removing those transactions from your ledger…' : 'Taking that file off the list…'}/>}
    {(files.length > 0 || live.length > 0) && <section className="section-gap imports"><h2>Imports</h2>{files.length > 0 && <p className="meta">Files waiting for review stay encrypted until you confirm.</p>}{Array.from(new Set(batches.map(b=>b.sessionId).filter(Boolean))).map(sessionId=>{const group=batches.filter(b=>b.sessionId===sessionId && ['staged','quarantined'].includes(b.status));return group.length>1 ? <Row key={sessionId} trailing={<Button onClick={()=>setUpdateReview(group.map(b=>b.id))}>Review update</Button>}>{group.length} files in this update</Row>:null;})}{files.map(file => <Row key={file.id} trailing={<Button onClick={() => setFileId(file.id)}>Read file</Button>}><h3>{file.name}</h3><p>Waiting for review</p></Row>)}{live.map(batch => <Row key={batch.id} trailing={batch.status === 'committed' ? <Button onClick={() => setUndo(batch)}>Roll back</Button> : <Button onClick={() => setReviewId(batch.id)}>Review</Button>}><h3>{batchName(batch)}</h3><p>{batch.note ? `${batch.fileName} · ` : ''}{batch.status === 'quarantined' ? 'Balance mismatch · quarantined' : batch.status === 'staged' ? 'Awaiting your confirmation' : 'Committed'}</p></Row>)}</section>}
    {/* A rolled-back file affects nothing any more, so it stops taking up the screen — but it is not
        deleted behind somebody's back either. It folds away, and it can be cleared out by hand. */}
    {removed.length > 0 && <details className="section-gap"><summary>{removed.length} {removed.length === 1 ? 'file removed from the ledger' : 'files removed from the ledger'}</summary>{removed.map(batch => <Row key={batch.id} trailing={<Button variant="quiet" disabled={forgetImport.isPending} onClick={() => forgetImport.mutate(batch.id)}>Remove from list</Button>}><h3>{batchName(batch)}</h3><p>Its transactions are already out of your ledger. Removing it here forgets the file as well.</p></Row>)}{forgetImport.error && <Failure error={forgetImport.error}/>}</details>}
    {accounts.some(account => batches.some(b => b.status === 'committed' && !b.payslip && b.context.accountId === account.id)) && <section className="section-gap"><h2>Coverage</h2>{accounts.map(account => <Coverage key={account.id} account={account} batches={batches}/>)}</section>}
    {bulkOpen&&<BulkCategories onClose={()=>setBulkOpen(false)}/>}
    {batches.some(b => b.status === 'committed' && b.payslip) && <section className="section-gap"><h2>Payslips</h2>{accounts.map(account => { const pays = batches.filter(b => b.status === 'committed' && b.context.accountId === account.id).flatMap(b => b.payslip ? [b.payslip] : []); if (!pays.length) return null; const metrics = payMetrics(pays); return <div key={account.id}><h3>{account.name}</h3><Row trailing={<span>{metrics.cycle.replaceAll('_', ' ')}</span>}>Detected pay cycle</Row><p className="meta">At least three distinct pay dates are needed. Payslips link to ledger income; they never add a second salary transaction.</p>{pays.map((p, i) => <Row key={i} trailing={<Amount value={money(BigInt(p.net), p.currency)} context="Payslip net pay"/>}>{p.employer}<p>{p.payDate} · Net pay</p></Row>)}</div>; })}</section>}
    {updateReview && <UpdateReview ids={updateReview} onClose={()=>setUpdateReview(null)} onResult={imported}/>}
    {fileId && <FileReview id={fileId} accounts={accounts} onClose={() => setFileId(null)} onStaged={id => { setFileId(null); setReviewId(id); }}/>} {reviewId && <BatchReview id={reviewId} onClose={() => setReviewId(null)} onResult={imported}/>}
    {transaction && <Sheet title="Source transaction" onClose={() => setTransaction(null)}><div className="stack"><Amount value={money(BigInt(transaction.minor), transaction.currency)} context={transaction.merchant}/><p>{transaction.date} · {accounts.find(a => a.id === transaction.accountId)?.name}</p><pre className="raw-excerpt">{transaction.description}</pre><p>{transaction.transferGroup ? 'Matched internal transfer. Excluded from income and spending.' : transaction.category ?? 'Uncategorised'}</p><AiCategoryFix key={'ai:'+transaction.id} row={transaction}/>{!transaction.transferGroup&&!transaction.pending&&BigInt(transaction.minor)<0n&&<TransactionSplits key={transaction.id} id={transaction.id} minor={transaction.minor} code={transaction.currency}/>}{!transaction.pending&&BigInt(transaction.minor)!==0n&&<ForeignCurrency key={'fx:'+transaction.id} id={transaction.id} code={transaction.currency}/>}{!transaction.pending&&!transaction.transferGroup&&BigInt(transaction.minor)!==0n&&<Refunds key={'refund:'+transaction.id} id={transaction.id} credit={BigInt(transaction.minor)>0n}/>}<TransactionAttachments target={transaction.id} recordedMinor={transaction.minor} code={transaction.currency}/><SettlementHistory id={transaction.id}/>{/* Edit and delete belong to something recorded by hand: there is no statement behind it to disagree
        with. An imported row is evidence of what a bank says happened, and editing that would be
        rewriting the record rather than correcting it.

        A bank NOTIFICATION is neither: nothing has confirmed it, so unlike an imported row it stays
        revocable, but unlike a hand-recorded one there is no form behind it to edit — only the wording
        the bank sent, which is not the owner's to rewrite. Delete is what fits it: gone means gone from
        the balance and from the intelligence engine alike, both of which only ever read what is still
        in the ledger. */}
      {transaction.manualId && entryError && <p role="alert">{entryError}</p>}{transaction.manualId && <div className="form-actions"><Button disabled={opening} onClick={() => void openManual(setEditEntry)}>Edit</Button><Button disabled={opening} onClick={() => void openManual(setMatchEntry)}>Match with statement</Button><Button variant="danger" disabled={opening} onClick={() => void openManual(setRemoveEntry)}>Delete</Button></div>}{transaction.noticeId && <div className="form-actions"><Button variant="danger" disabled={forgetNotice.isPending} onClick={() => setRemoveNotice({id: transaction.noticeId!, description: transaction.merchant})}>Delete</Button></div>}{/* A real statement file backs this row: shown as evidence. A notification or a hand-typed entry
          backs no file at all, and printing its internal row marker here was an implementation detail
          leaking onto the screen rather than provenance worth reading. */}
      {transaction.sources.some(s => batches.some(b => b.id === s.batchId)) && <><h3>Supporting statements</h3>{transaction.sources.filter(s => batches.some(b => b.id === s.batchId)).map(s => <p key={s.batchId + s.sourceId}>{batchName(batches.find(b => b.id === s.batchId))} · row {s.sourceId}</p>)}</>}</div></Sheet>}
    {undo && <Sheet title="Roll back this import?" onClose={() => { if (!rollback.isPending) setUndo(null); }}><div className="stack"><p>{batchName(undo)}</p><p>Remove this statement’s contribution. Transactions supported by other committed statements remain. Rules created by this import are removed with it.</p>{rollback.error && <Failure error={rollback.error}/>}<Button variant="danger" disabled={rollback.isPending} onClick={() => rollback.mutate(undo.id)}>Confirm rollback</Button></div></Sheet>}
  </section>;
}
function Coverage({ account, batches }: { account: Account; batches: BatchSummary[] }) {
  const ranges = coverage(batches.filter(b => b.status === 'committed' && !b.payslip && b.context.accountId === account.id).map(b => b.context.period));
  if (!ranges.length) return null;
  const missing = gaps(ranges, { start: ranges[0]!.start, end: ranges.at(-1)!.end });
  // One line: what is covered, and each gap by date, because a gap is left out of daily averages.
  return <p className="coverage meta">{account.name}: {coveredDays(ranges)} days covered, {ranges[0]!.start}–{ranges.at(-1)!.end}
    {missing.length ? ` · No data ${missing.map(r => `${r.start}–${r.end}`).join(', ')}` : ' · no gaps'}</p>;
}
/** A file's own words for it, when the owner gave any; the file name otherwise. */
const batchName = (batch?: Pick<BatchSummary, 'fileName' | 'note'>) => batch?.note || batch?.fileName || '';
function FileReview({ id, accounts, onClose, onStaged }: { id: string; accounts: Account[]; onClose: () => void; onStaged: (id: string) => void }) {
  const session = useSession(), query = useQueryClient();
  const [accountId, setAccount] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState(''), [opening, setOpening] = useState(''), [closing, setClosing] = useState(''), [dateOrder, setOrder] = useState<'DMY' | 'MDY'>('DMY'), [decimal, setDecimal] = useState<'.' | ','>('.'), [invert, setInvert] = useState(false), [payslip, setPayslip] = useState(false), [note, setNote] = useState(''), [progress, setProgress] = useState(''), [mapping, setMapping] = useState<ExportMapping | undefined>();
  const selectedAccountId = accountId || accounts[0]?.id || '';
  const prepared = useQuery({ queryKey: ['statement-details', id], queryFn: async () => {
    const file = await session.run(repo => repo.imports.loadFile(id));
    const source = new FileSource(decodeFile(file.data), file.fileName);
    return { source, sessionId: file.sessionId, details: await source.inspect(setProgress) };
  }, retry: false });
  // WHAT THE FILE SAYS FILLS THE FORM. "when i import something, i dont want to fill up any dates,
  // opening or closing. The app should do that for me." The fields stay, folded under a disclosure, for
  // the one file in a hundred that needs a correction; nothing a person typed is ever overwritten. The
  // payslip box ticks itself when the labels are there, and the account is picked the way a
  // notification's is — by the last four digits the person already recorded — when exactly one matches.
  useEffect(() => {
    const details = prepared.data?.details; if (!details) return;
    setStart(value => value || details.start); setEnd(value => value || details.end); setOpening(value => value || details.opening); setClosing(value => value || details.closing);
    if (details.payslip) setPayslip(true);
    const matches = details.accountTail ? accounts.filter(a => a.mask_last4 === details.accountTail) : [];
    if (matches.length === 1) setAccount(value => value || matches[0]!.id);
  }, [prepared.data, accounts]);

  const mutation = useMutation({ mutationFn: async (override?: ExportMapping) => {
    const account = accounts.find(a => a.id === selectedAccountId); if (!account) throw new Error('Choose the account this statement belongs to.');
    const ready = prepared.data ?? (await prepared.refetch()).data; if (!ready) throw new Error('The file could not be read. Try reading it again.');
    const context: ImportContext = { accountId: account.id, accountKind: account.type as ImportContext['accountKind'], currency: currency(account.currency), period: { start: start || ready.details.start, end: end || ready.details.end }, dateOrder, decimal, creditPositivePurchases: invert };
    setProgress('Preparing transactions for review…');
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const aliases = await session.run(repo => repo.imports.aliases());
    {
      const saved = override ?? mapping ?? await session.run(repo=>repo.imports.savedMapping(account.institution));
      const source = ready.source;
      const doc = await source.fetch({ context, opening: payslip ? '0' : opening || ready.details.opening, closing: payslip ? '0' : closing || ready.details.closing, payslip, ...(saved ? {mapping:saved}:{}), aliases }, setProgress, account.institution);
      if (override || mapping) await session.run(repo=>repo.imports.saveMapping(account.institution,(override ?? mapping)!));
      return await session.run(async repo => { const result = await repo.imports.stage({...doc,...(ready.sessionId?{sessionId:ready.sessionId}:{})}); if (note.trim()) await repo.imports.setNote(result.id, note); await repo.imports.removeFile(id); return result; });
    }
  }, onSuccess: async result => { await query.invalidateQueries({ queryKey: ['imports'] }); onStaged(result.id); } });
  const discard = useMutation({ mutationFn: () => session.run(repo => repo.imports.removeFile(id)), onSuccess: async () => { await query.invalidateQueries({ queryKey: ['imports'] }); onClose(); } });
  const details = prepared.data?.details, code = currency(accounts.find(a => a.id === selectedAccountId)?.currency ?? 'AUD');
  const shown = (value: string) => { try { return format(money(normalizeAmount(value, code, '.'), code)); } catch { return value; } };
  // What was read, in one line, so the folded fields need no opening to be trusted.
  const readLine = !details ? '' : details.read === 'none' ? 'The dates this file covers could not be read. Enter them below.'
    : `Read from the file: ${start} – ${end}${payslip ? '' : details.read === 'statement' ? ` · opens ${shown(opening)} · closes ${shown(closing)}` : ' · no stated balances printed'}`;
  const adjusting = !details || details.read === 'none' || (!payslip && (!start || !end)) || !!mutation.error;
  return <Sheet title="Confirm statement details" onClose={() => { if (!mutation.isPending && !discard.isPending) onClose(); }}><form className="stack" aria-busy={prepared.isPending || mutation.isPending || discard.isPending} onSubmit={e => { e.preventDefault(); mutation.mutate(mapping); }}>{(prepared.isPending || mutation.isPending) && <ImportProgress message={progress || (prepared.isPending ? 'Reading statement details…' : 'Preparing transactions for review…')}/>}{discard.isPending && <ImportProgress message="Discarding this file…"/>}<label className="input-label">Account<select value={selectedAccountId} onChange={e => setAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
    <Input label="Description" value={note} maxLength={200} onChange={e => setNote(e.target.value)} hint="Optional. What this file is, in your words."/>
    {readLine && <p className="meta" role="status">{readLine}</p>}
    <label className="check-row"><input type="checkbox" checked={payslip} onChange={e => setPayslip(e.target.checked)}/>This is a payslip</label>
    <details className="adjust-details" open={adjusting || undefined}><summary>Adjust what was read</summary><div className="stack">
    <div className="split-field"><Input label="Statement start" type="date" required value={start} onChange={e => setStart(e.target.value)}/><Input label="Statement end" type="date" required value={end} onChange={e => setEnd(e.target.value)}/></div><p className="meta">Use the dates printed on this file. For payslips, include the pay date in this window.</p>
    {!payslip && <><Input label="Stated opening balance" inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)}/><Input label="Stated closing balance" inputMode="decimal" value={closing} onChange={e => setClosing(e.target.value)}/><p className="meta">Leave both blank for a file without stated balances; its running balance is checked instead. For credit cards, enter money owed as negative balances.</p></>}
    <div className="split-field"><label className="input-label">Date format<select value={dateOrder} onChange={e => setOrder(e.target.value as 'DMY' | 'MDY')}><option value="DMY">Day / month</option><option value="MDY">Month / day</option></select></label><label className="input-label">Decimal separator<select value={decimal} onChange={e => setDecimal(e.target.value as '.' | ',')}><option value=".">Dot · 1,234.56</option><option value=",">Comma · 1.234,56</option></select></label></div>
    {accounts.find(a => a.id === selectedAccountId)?.type === 'credit' && <label className="check-row"><input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)}/>Positive signed amounts are card purchases</label>}
    </div></details>
    {prepared.error && <><Failure error={prepared.error}/><Button onClick={() => void prepared.refetch()}>Try reading file again</Button></>}
    {mutation.error instanceof MappingRequired && <><ColumnMapping table={mutation.error.table} mapping={mapping ?? mutation.error.proposal} onChange={setMapping}/><Button onClick={()=>{const selected=mapping ?? (mutation.error as MappingRequired).proposal;setMapping(selected);mutation.mutate(selected);}}>Use mapping and read</Button></>}
    {/* The dates are filled in, not submitted. The statement period is a thing a person declares about
        their own file, and an app that silently widens it to whatever makes the import succeed is an
        app whose coverage claims mean nothing. He sees the two fields change, then presses Extract. */}
    {mutation.error instanceof PeriodTooNarrow && <Button onClick={()=>{const span=(mutation.error as PeriodTooNarrow).span;setStart(span.start);setEnd(span.end);}}>Use {(mutation.error as PeriodTooNarrow).span.start} – {(mutation.error as PeriodTooNarrow).span.end}</Button>}
    {mutation.error && <Failure error={mutation.error}/>} {discard.error && <Failure error={discard.error}/>} <div className="form-actions"><Button disabled={mutation.isPending || discard.isPending} onClick={() => discard.mutate()}>Discard file</Button><Button type="submit" variant="primary" disabled={mutation.isPending || discard.isPending}>Extract for review</Button></div></form></Sheet>;
}
function BatchReview({ id, onClose, onResult }: { id: string; onClose: () => void; onResult:(message:string, added:number)=>void }) {
  const session = useSession(), query = useQueryClient(); const [selected, setSelected] = useState<Review['items'][number] | null>(null), [shown, setShown] = useState(FIRST);
  const review = useQuery({ queryKey: ['import-review', id], queryFn: () => session.run(repo => repo.imports.review(id)) });
  const commit = useMutation({ mutationFn: () => session.run(repo => repo.imports.commit(id)), onSuccess: async result => { onResult(importResultSentence([result]), result.added + result.superseded); await query.invalidateQueries(); onClose(); } });
  const keepAll = useMutation({ mutationFn: () => session.run(repo => repo.imports.keepSeparate(id)), onSuccess: () => query.invalidateQueries({ queryKey: ['import-review', id] }) });
  const discard = useMutation({ mutationFn: () => session.run(repo => repo.imports.rollback(id)), onSuccess: async () => { await query.invalidateQueries(); onClose(); } });
  const leaveCategories = useMutation({ mutationFn: () => session.run(repo => repo.imports.leaveCategoriesUnassigned(id)), onSuccess: () => query.invalidateQueries({ queryKey: ['import-review', id] }) });
  const useSuggested = useMutation({ mutationFn: () => session.run(repo => repo.imports.useSuggestedCategories(id)), onSuccess: () => query.invalidateQueries({ queryKey: ['import-review', id] }) });
  const value = review.data;
  // Five rows are only enough if they are the right five. Source order put four identical fuel purchases
  // at the top of a 733-row import while the rows that actually block Confirm — the ones needing review —
  // sat at position four hundred, with the button greyed out and nothing on screen saying why. Ordering by
  // what needs a decision costs nothing and makes the short list the useful one.
  // Rows whose look-alikes are all inside this same file, which is the question that can be answered once.
  const sameFileLookalikes = (value?.items ?? []).filter(item => item.blocked && (item.collision || item.near.length > 0)
    && !item.near.some(r => r.sources.some(source => source.batchId !== id))).length;
  // Why the confirm cannot be pressed, in the words somebody would use about their own statement.
  const blocking = !value || value.doc.status === 'committed' ? ''
    : !value.balance.valid ? 'The running balance in this file does not add up, so it is quarantined rather than added.'
    : value.uncertainCount > 0 ? `${value.uncertainCount} ${value.uncertainCount === 1 ? 'row needs' : 'rows need'} a decision before this can be added. They are at the top of the list, marked “Review needed”.`
    : '';
  const ordered = value ? [...value.items].sort((a, b) =>
    (a.blocked ? 0 : a.duplicate ? 1 : 2) - (b.blocked ? 0 : b.duplicate ? 1 : 2)) : [];
  return <Sheet title="Review import" onClose={() => { if (!commit.isPending && !discard.isPending) onClose(); }}><div className="stack" aria-busy={commit.isPending || undefined}>{review.error && <Failure error={review.error}/>} {value && <><p>{value.doc.fileName}</p>{value.doc.status === 'committed' ? <p>This file is already imported. No transactions were added a second time.</p> : <><div className="review-counts"><span>{value.newCount} new</span><span>{value.duplicateCount} duplicates skipped</span><span>{value.uncertainCount} uncertain</span>{value.supersededCount>0 && <span>{value.supersededCount} pending updated</span>}</div><p>{value.doc.integrityTier==='C' ? `Tier C · Continuity-checked · balance unverified. ${value.continuity==='gap'?'There is a coverage gap before this export.':value.continuity==='first-import'?'This is the first covered period.':'This range overlaps or continues existing coverage.'}` : value.doc.integrityTier==='B' && value.balance.valid ? 'Tier B · Running-balance-verified' : value.balance.valid ? '✓ Balance check passed' : `Balance mismatch: ${format(money(value.balance.difference, value.doc.context.currency))}. This import is quarantined.`}</p><p>{coveredDays(value.coverageAdded)} new covered days. Coverage: {value.doc.context.period.start}–{value.doc.context.period.end}{value.doc.payslip ? ' · Payslips do not add statement coverage' : ''}</p>{!value.doc.payslip && (!value.doc.integrityTier || value.doc.integrityTier==='A') && <BalanceCorrection review={value}/>}{value.doc.payslip && <div className="stack"><h3>{value.doc.payslip.employer}</h3><p>Pay date {value.doc.payslip.payDate}</p>{(['gross', 'net', 'tax', 'super'] as const).map(key => <Row key={key} trailing={<Amount value={money(BigInt(value.doc.payslip![key]), value.doc.context.currency)} context={`Payslip ${key}`}/>}>{key === 'gross' ? 'Gross pay' : key === 'net' ? 'Net pay' : key === 'tax' ? 'Tax withheld' : 'Super / pension'}</Row>)}<PayslipCorrection review={value}/><p className="meta">Gross includes allowances. Deductions reduce net pay; employer super does not. Check these values against your source.</p></div>}
    {sameFileLookalikes > 0 && <div className="stack">
      <p>{sameFileLookalikes} {sameFileLookalikes === 1 ? 'row looks' : 'rows look'} like another row in this same file: the same amount and place, within three days. Usually these are separate purchases.</p>
      <Button disabled={keepAll.isPending || commit.isPending} onClick={() => keepAll.mutate()} busy={keepAll.isPending} busyLabel="Settling…">{`Keep all ${sameFileLookalikes} as separate purchases`}</Button>
      <p className="meta">Anything that looks like a transaction already in your ledger is left out of this and still has to be checked on its own, because that is where the same money can be counted twice.</p>
      {keepAll.error && <Failure error={keepAll.error}/>}
    </div>}
    {value.items.some(item => item.categoryOnly) && <div className="stack">
      <p>{value.items.filter(item => item.categoryOnly).length} {value.items.filter(item => item.categoryOnly).length === 1 ? 'purchase has a category' : 'purchases have categories'} worked out from the statement wording, with less than full certainty. Accepting them takes one press, and any of them can be changed afterwards in the ledger.</p>
      <Button disabled={useSuggested.isPending || leaveCategories.isPending || commit.isPending} onClick={() => useSuggested.mutate()}>Use these categories</Button>
      <Button variant="quiet" disabled={useSuggested.isPending || leaveCategories.isPending || commit.isPending} onClick={() => leaveCategories.mutate()}>Leave them uncategorised</Button>
      {useSuggested.error && <Failure error={useSuggested.error}/>}{leaveCategories.error && <Failure error={leaveCategories.error}/>}
    </div>}
    {ordered.slice(0, shown).map(item => <button key={item.row.sourceId} type="button" className="transaction-row" onClick={() => setSelected(item)}><span><strong>{item.row.merchant}</strong><span className="meta">{item.row.date} · {item.blocked ? 'Review needed' : item.duplicate ? 'Duplicate' : item.row.category ?? 'Uncategorised'}</span></span><Amount value={money(BigInt(item.row.minor), item.row.currency)} context={item.row.merchant}/></button>)}{shown < ordered.length && <Button onClick={() => setShown(n => n + MORE)}>Show more · {ordered.length - shown} left</Button>}
    {commit.error && <Failure error={commit.error}/>} {discard.error && <Failure error={discard.error}/>}
    {/* Committing hundreds of rows takes long enough that a button reading "Committing…" at the bottom of a
        long list leaves the screen looking stuck. The wait belongs where the eye is, and it says what it is
        waiting for. */}
    {commit.isPending && <BusyOverlay message="Adding these transactions to your ledger…"/>}
    {/* Discarding rebuilds the ledger just as committing does, and it had no sign of life at all: the
        sheet simply sat there, which reads as a frozen app rather than as work being done. */}
    {discard.isPending && <BusyOverlay message="Discarding this import…"/>}
    {/* A DISABLED BUTTON THAT DOES NOT SAY WHY IS A BROKEN BUTTON. "when i click confirm, nothing happens"
        — it was refusing because rows were unsettled, and the only place that was written down was the
        word "uncertain" in a row of counts at the top of a long list. */}
    {blocking && <p role="status" className="import-blocked">{blocking}</p>}
    <div className="form-actions sheet-actions"><Button disabled={commit.isPending || discard.isPending} onClick={() => discard.mutate()}>Discard import</Button><Button variant="primary" disabled={!!blocking || commit.isPending || discard.isPending} onClick={() => commit.mutate()} busy={commit.isPending} busyLabel="Committing…">Confirm import</Button></div></>}</>}{selected && <RowCorrection id={id} item={selected} onClose={() => setSelected(null)}/>}</div></Sheet>;
}
function BalanceCorrection({ review }: { review: Review }) {
  const session = useSession(), query = useQueryClient(); const code = review.doc.context.currency;
  const [opening, setOpening] = useState(decimalString(review.doc.opening, code)), [closing, setClosing] = useState(decimalString(review.doc.closing, code));
  const update = useMutation({ mutationFn: () => session.run(repo => repo.imports.correctBalances(review.doc.id, normalizeAmount(opening, code, '.').toString(), normalizeAmount(closing, code, '.').toString())), onSuccess: () => query.invalidateQueries({ queryKey: ['import-review', review.doc.id] }) });
  return <details><summary>Check stated balances</summary><div className="stack"><Input label="Opening balance (decimal dot)" value={opening} onChange={e => setOpening(e.target.value)}/><Input label="Closing balance (decimal dot)" value={closing} onChange={e => setClosing(e.target.value)}/><p className="meta">Copy the values printed on the statement. Do not change them just to clear a mismatch.</p>{update.error && <Failure error={update.error}/>}<Button disabled={update.isPending} onClick={() => update.mutate()}>Save stated balances</Button></div></details>;
}
function RowCorrection({ id, item, onClose }: { id: string; item: Review['items'][number]; onClose: () => void }) {
  const session = useSession(), query = useQueryClient(); const row = item.row;
  const [date, setDate] = useState(row.date), [description, setDescription] = useState(row.description), [amount, setAmount] = useState(decimalString(row.minor, row.currency)), [category, setCategory] = useState(row.category ?? item.suggestion.category ?? ''), [rule, setRule] = useState(false), [distinct, setDistinct] = useState(!!row.occurrence), [duplicateOf, setDuplicate] = useState(row.duplicateOf ?? '');
  const correction = useMutation({ mutationFn: () => {
    const change: Pick<NormalizedRow, 'date' | 'description' | 'merchant' | 'minor' | 'category' | 'occurrence' | 'duplicateOf'> = { date, description, merchant: merchantName(description), minor: normalizeAmount(amount, row.currency, '.').toString(), category: category || null, occurrence: distinct ? row.reference || `${id}:${row.sourceId}` : '', duplicateOf: duplicateOf || null };
    return session.run(repo => repo.imports.correct(id, row.sourceId, change, rule));
  }, onSuccess: async () => { await query.invalidateQueries({ queryKey: ['import-review', id] }); onClose(); } });
  return <Sheet title="Check transaction" onClose={() => { if (!correction.isPending) onClose(); }}><form className="stack" onSubmit={e => { e.preventDefault(); correction.mutate(); }}><pre className="raw-excerpt">{item.original?.description ?? row.description}{'\n'}{item.original?.date ?? row.date} · {item.original?.amount ?? decimalString(row.minor, row.currency)} {row.currency}</pre>{row.issues.map(issue => <p key={issue}>{issue}</p>)}<p className="meta">{item.suggestion.reason}</p><Input label="Posted date" type="date" required value={date} onChange={e => setDate(e.target.value)}/><Input label="Description" required value={description} onChange={e => setDescription(e.target.value)}/><Input label="Amount" required value={amount} onChange={e => setAmount(e.target.value)} hint="Negative for money out, positive for money in. Use a dot for cents, like -12.50."/><label className="input-label">Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Leave uncategorised</option>{categoryNames.map(c => <option key={c}>{c}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={rule} onChange={e => setRule(e.target.checked)}/>Use this category for this merchant in future imports</label>{item.collision && <><p>Identical date, merchant and amount appear more than once. Confirm whether this is another purchase or the same transaction.</p><label className="check-row"><input type="checkbox" checked={distinct} onChange={e => setDistinct(e.target.checked)}/>Keep as a separate purchase</label></>}{item.near.length > 0 && <label className="input-label">Possible pending-to-posted duplicate<select value={duplicateOf} onChange={e => setDuplicate(e.target.value)}><option value="">Keep as a separate transaction</option>{item.near.filter(r => r.sources.some(s => s.batchId !== id)).map(r => <option key={r.id} value={r.id}>Same transaction as {r.date} · {r.merchant}</option>)}</select></label>}{correction.error && <Failure error={correction.error}/>}<Button variant="primary" type="submit" disabled={correction.isPending}>Confirm this row</Button></form></Sheet>;
}
function PayslipCorrection({ review }: { review: Review }) {
  const session = useSession(), query = useQueryClient(); const original = review.doc.payslip!;
  const [pay, setPay] = useState(original), [values, setValues] = useState({ gross: decimalString(original.gross, original.currency), net: decimalString(original.net, original.currency), tax: decimalString(original.tax, original.currency), super: decimalString(original.super, original.currency) });
  const update = useMutation({ mutationFn: () => session.run(repo => repo.imports.correctPayslip(review.doc.id, { ...pay, gross: normalizeAmount(values.gross, pay.currency, '.').toString(), net: normalizeAmount(values.net, pay.currency, '.').toString(), tax: normalizeAmount(values.tax, pay.currency, '.').toString(), super: normalizeAmount(values.super, pay.currency, '.').toString() })), onSuccess: () => query.invalidateQueries({ queryKey: ['import-review', review.doc.id] }) });
  return <details><summary>Check payslip fields and source</summary><div className="stack"><pre className="raw-excerpt">{review.doc.sourceText ?? 'Open the original payslip to compare these fields.'}</pre><Input label="Employer" value={pay.employer} onChange={e => setPay(p => ({ ...p, employer: e.target.value }))}/><Input label="Pay date" type="date" value={pay.payDate} onChange={e => setPay(p => ({ ...p, payDate: e.target.value }))}/><Input label="Pay period start" type="date" value={pay.period.start} onChange={e => setPay(p => ({ ...p, period: { ...p.period, start: e.target.value } }))}/><Input label="Pay period end" type="date" value={pay.period.end} onChange={e => setPay(p => ({ ...p, period: { ...p.period, end: e.target.value } }))}/>{(['gross', 'net', 'tax', 'super'] as const).map(key => <Input key={key} label={key === 'gross' ? 'Gross pay' : key === 'net' ? 'Net pay' : key === 'tax' ? 'Tax withheld' : 'Super / pension'} hint="Use a dot for cents, like 1234.50." value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}/>)}{original.allowances.map((a, i) => <Row key={`a${i}`} trailing={<Amount value={money(BigInt(a.minor), pay.currency)} context={a.name}/>}>Allowance · {a.name}</Row>)}{original.deductions.map((a, i) => <Row key={`d${i}`} trailing={<Amount value={money(BigInt(a.minor), pay.currency)} context={a.name}/>}>Deduction · {a.name}</Row>)}{Object.entries(original.ytd).map(([name, minor]) => <Row key={name} trailing={<Amount value={money(BigInt(minor), pay.currency)} context={`Year to date ${name}`}/>}>Year to date · {name}</Row>)}{update.error && <Failure error={update.error}/>}<Button disabled={update.isPending} onClick={() => update.mutate()}>Save payslip fields</Button></div></details>;
}

function UpdateReview({ids,onClose,onResult}:{ids:string[];onClose:()=>void;onResult:(message:string, added:number)=>void}) {
 const session=useSession(),query=useQueryClient();
 const review=useQuery({queryKey:['update-review',...ids],queryFn:()=>session.run(async repo=>{const results=[];for(const id of ids)results.push(await repo.imports.review(id));return results;})});
 const commit=useMutation({mutationFn:()=>session.run(repo=>repo.imports.commitSession(ids)),onSuccess:async results=>{onResult(importResultSentence(results), results.reduce((sum, result) => sum + result.added + result.superseded, 0));await query.invalidateQueries();onClose();}});
 const ready=review.data?.every(r=>r.balance.valid && !r.uncertainCount);
 return <Sheet title="Review account update" onClose={()=>{if(!commit.isPending)onClose();}}><div className="stack"><p>These files are one update. All commits succeed together, or none are kept.</p>{review.data?.map(r=><Row key={r.doc.id}><h3>{r.doc.fileName}</h3><p>Tier {r.doc.integrityTier??'A'} · {tierLabel[r.doc.integrityTier??'A']} · {r.uncertainCount} rows need review</p></Row>)}{!ready && <p>Close this sheet and review each file’s rows or balance mismatch before confirming the update.</p>}{(review.error||commit.error) && <Failure error={(review.error||commit.error)!}/>}<Button variant="primary" disabled={!ready||commit.isPending} onClick={()=>commit.mutate()}>Confirm update</Button></div></Sheet>;
}
function SettlementHistory({id}:{id:string}) {
 const session=useSession();const audit=useQuery({queryKey:['settlement-audit',id],queryFn:()=>session.run(repo=>repo.imports.audit(id))});
 return audit.data?.length ? <section className="stack"><h3>Settlement history</h3>{audit.data.map((entry,i)=>{const before=entry.before as LedgerRow,after=entry.after as LedgerRow;return <p key={i}>Pending {format(money(BigInt(before.minor),before.currency))} on {before.date} became settled {format(money(BigInt(after.minor),after.currency))} on {after.date}. The original transaction ID is retained.</p>;})}</section>:null;
}

import { ManualHistory, ManualSheet } from './screens/Manual';
import { capturedNotices, forgetNotices, readNotices } from '../ingest/notices';
import { applyShadeDecisions } from './notices';
import { NoticeReview } from './screens/NoticeReview';
import {FirstImport} from './screens/FirstImport';
import {useQuickAddLaunch} from './quick-add';
import { NotificationSync } from './screens/Notifications';
import { Intelligence } from './screens/Intelligence';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, FileText, Layers3, LockKeyhole, Plus, Search, ShieldCheck, WalletCards } from 'lucide-react';
import { currency, fromDatabase } from '../core/money';
import { Amount, Button, EmptyState, Input, Row, Sheet, Skeleton, Tabs, Toast, type Tab } from './design/primitives';
import { followSystem } from './design/theme';
import { useSession } from './session';
import { Brand, LockScreen } from './screens/Lock';
import { AccountSheet } from './screens/AccountSheet';
import { coveredDays } from '../ingest/reconcile';
import { Freshness, UpdateAccounts } from './screens/UpdateAccounts';
import { localDay, syncReminder } from '../ingest/reminders';
const ImportWorkspace=lazy(()=>import('./screens/ImportWorkspace').then(module=>({default:module.ImportWorkspace})));
const SpendingPatterns=lazy(()=>import('./screens/SpendingPatterns').then(module=>({default:module.SpendingPatterns})));
const MoneyVisuals=lazy(()=>import('./screens/MoneyVisuals').then(module=>({default:module.MoneyVisuals})));
const Analysis=lazy(()=>import('./screens/Analysis').then(module=>({default:module.Analysis})));
const BulkProposals=lazy(()=>import('./screens/BulkProposals').then(module=>({default:module.BulkProposals})));
const NetWorth=lazy(()=>import('./screens/NetWorth').then(module=>({default:module.NetWorth})));
import {Settings} from './screens/Settings';
const useNavigation = create<{ tab: Tab; setTab: (tab: Tab) => void }>(set => ({ tab: 'Today', setTab: tab => set({ tab }) }));
export default function App() {
  const { tab, setTab } = useNavigation(); const session = useSession(); const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<'quick' | 'account' | 'update' | 'manual' | 'notices' | null>(null); const [search, setSearch] = useState(''); const [toast, setToast] = useState('');
  const [importRequest, setImportRequest] = useState(0);
  const consumeImport = useCallback(() => setImportRequest(0), []);
  const dismissToast = useCallback(() => setToast(''), []);
  const [quickAddRequest,setQuickAddRequest]=useState<string|null>(null);
  const openManual=useCallback((requestId:string)=>{setQuickAddRequest(requestId);setSheet('manual');},[]);
  useEffect(followSystem, []);
  useEffect(() => { if (session.state !== 'ready' && session.state !== 'preview') { setSheet(null); setQuickAddRequest(null); setSearch(''); setToast(''); } }, [session.state]);
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => session.run(repo => repo.accounts()), enabled: session.state === 'ready' });
  const quickAddDisplayed=(sheet==='manual'&&Boolean(accounts.data?.length))||(sheet==='account'&&accounts.data?.length===0);
  const quickAddError=useQuickAddLaunch(session.state==='ready',openManual,quickAddDisplayed?quickAddRequest:null);
  // What the bank announced while the app was closed. Asked once on opening and not again until there is
  // something new, because a prompt that reappears after being dismissed stops being read.
  const noticeQueue = useQuery({ queryKey: ['captured-notices'], queryFn: capturedNotices, enabled: session.state === 'ready' });
  const [noticesAsked, setNoticesAsked] = useState(false);
  const statementData = useQuery({ queryKey: ['coverage-summary'], queryFn: () => session.run(repo => repo.imports.summaries()), enabled: session.state === 'ready' });
  useEffect(()=>{if(session.state==='ready' && accounts.data && statementData.data)void session.run(repo=>repo.imports.reminderDay()).then(day=>syncReminder(day,accounts.data!.map(a=>a.id),statementData.data!,localDay())).catch(()=>undefined);},[session.state,accounts.data,statementData.data]);
  useEffect(()=>{if(sheet==='manual' && accounts.data?.length===0)setSheet('account');},[sheet,accounts.data]);
  const firstAccount = accounts.data?.find(a => !a.archived_at);
  const undecided = (noticeQueue.data ?? []).filter(n => !n.decision);
  const waitingNotices = firstAccount ? readNotices(undecided, currency(firstAccount.currency)).readable.length : 0;
  // Answers given in the shade are carried out here, on the first unlock after they were given: this is
  // the earliest moment the encrypted ledger can receive them. Only the unanswered ones are asked about.
  const [settled, setSettled] = useState(false);
  useEffect(()=>{
    if(settled || !firstAccount || !noticeQueue.data?.some(n=>n.decision))return;
    setSettled(true);
    void applyShadeDecisions(noticeQueue.data, currency(firstAccount.currency), firstAccount.id,
      record => session.run(repo => repo.notices.approve(record)), forgetNotices)
      .then(async result => { if(result.approved)await queryClient.invalidateQueries(); })
      .catch(()=>setSettled(false));
  },[settled,firstAccount,noticeQueue.data,session,queryClient]);
  useEffect(()=>{if(!noticesAsked && !sheet && waitingNotices>0){setNoticesAsked(true);setSheet('notices');}},[noticesAsked,sheet,waitingNotices]);
  const days = coveredDays((statementData.data ?? []).filter(b => b.status === 'committed' && !b.payslip).map(b => b.context.period));
  if (session.state !== 'ready' && session.state !== 'preview' && session.state !== 'background') return <LockScreen/>;
  const count = accounts.data?.length ?? 0;
  const accountAction = <Button variant="primary" onClick={() => setSheet('account')}><Plus size={16}/>Set up an account</Button>;
  // Verbs first, then navigation. Half of this list used to be "Open <tab>", which is movement rather than
  // an action; every one of them is still here, below the things a person opens this sheet to do.
  const quickActions = [{label:'Add transaction',icon:Plus,act:()=>setSheet('manual')},{ label: 'Import statements', icon: FileText, act: () => { if (!count) { setSheet('account'); return; } setTab('Ledger'); setSheet(null); setImportRequest(n => n + 1); } },{label:'Update accounts',icon:FileText,act:()=>setSheet('update')}, { label: 'Add an account', icon: Plus, act: () => setSheet('account') }, { label: 'Find a transaction', icon: Search, act: () => { setTab('Ledger'); setSheet(null); } }, ...(['Today', 'Ledger', 'Insights', 'You'] as const).map(t => ({ label: `Open ${t === 'You' ? 'settings' : t.toLowerCase()}`, icon: t === 'Today' ? CalendarDays : t === 'Ledger' ? FileText : t === 'Insights' ? Layers3 : ShieldCheck, act: () => { setTab(t); setSheet(null); } }))].filter(action => action.label.toLowerCase().includes(search.toLowerCase()));
  return <div className="app" aria-hidden={session.state === 'background' || undefined} style={session.state === 'background' ? { display: 'none' } : undefined}><header className="brand-bar"><Brand/><div className="privacy-status"><LockKeyhole size={12}/><span>{session.state === 'preview' ? 'Design preview' : 'On this device'}</span></div></header>
    <NotificationSync/>
    {session.state === 'preview' && <p className="notice">Account storage and security require the Android app.</p>}
    <main><header className="screen-header"><div><h1>{tab === 'You' ? 'Your money, your way' : tab}</h1><p>{tab === 'Today' ? 'What you have spent today.' : tab === 'Ledger' ? 'Every account. One place to understand it.' : tab === 'Insights' ? 'Patterns need evidence.' : 'A private ledger you control.'}</p></div>{tab === 'Ledger' && <Button variant="quiet" className="icon-button" aria-label="Add account" onClick={() => setSheet('account')}><Plus size={20}/></Button>}</header>
    {accounts.error && <p className="error" role="alert">Accounts could not be read. Lock and reopen Kairos before continuing.</p>}
    {quickAddError && <p className="error" role="alert">{quickAddError}</p>}
    {tab === 'Today' && <>{session.state==='ready'&&days===0&&<FirstImport hasAccount={count>0} loading={accounts.isPending} onAccount={()=>setSheet('account')} onRecord={()=>setSheet('manual')} onRead={()=>{setTab('Ledger');setImportRequest(n=>n+1);}}/>}<ManualHistory accounts={accounts.data??[]} today/><Button variant="primary" onClick={()=>setSheet('manual')}>Add transaction</Button><Intelligence mode="today"/><Freshness accounts={accounts.data??[]} batches={statementData.data??[]} today={localDay()} onUpdate={()=>setSheet('update')}/><Button onClick={()=>setTab('Insights')}>See where my money goes</Button></>}
    {tab === 'Ledger' && <>{session.state === 'ready' && accounts.isPending ? <Skeleton label="Reading accounts"/> : count ? <><div className="list-heading"><h2>Accounts</h2><span className="meta">Opening balances</span></div>{accounts.data?.map(account => <Row key={account.id} trailing={<Amount value={fromDatabase(account.opening_balance_minor, currency(account.currency))} context={`${account.name} opening balance`}/>}><div className="account-summary"><span className="account-symbol"><WalletCards size={18}/></span><div><h3>{account.name}</h3><p>{account.currency}{account.mask_last4 ? ` · ••${account.mask_last4}` : ''}</p></div></div></Row>)}</> : <EmptyState icon={<FileText size={28} strokeWidth={1.3}/>} title="Add an account to import your statement" action={accountAction}>Start with the account your salary arrives in, then import its statements.</EmptyState>}{!(session.state==='ready' && accounts.isPending)&&<Suspense fallback={<Skeleton label="Opening imports"/>}><ImportWorkspace accounts={accounts.data ?? []} request={importRequest} consumed={consumeImport}/></Suspense>}</>}
    {tab === 'Ledger' && count>0 && <><Suspense fallback={null}><BulkProposals/></Suspense><Button onClick={()=>setSheet('manual')}>Add transaction</Button><ManualHistory accounts={accounts.data??[]}/></>}
    {tab === 'Insights' && <><Suspense fallback={<Skeleton label="Opening spending patterns"/>}><SpendingPatterns/></Suspense><Intelligence/><Suspense fallback={<Skeleton label="Opening money analysis"/>}><Analysis/></Suspense></>}
    {tab === 'You' && <><Suspense fallback={<Skeleton label="Opening your money views"/>}><MoneyVisuals/><NetWorth/></Suspense><Row trailing={<span className="meta">{count}</span>}>Accounts set up</Row><Row trailing={<span className="meta">{days ? `${days} days of statement history` : 'No statements yet'}</span>}>Statement history</Row><div className="information"><ShieldCheck size={15}/><p>You stay in control. An imported statement is never added to your ledger until you review and confirm it.</p></div><Settings onAccount={() => setSheet('account')} notify={setToast}/></>}
    </main><Tabs current={tab} onChange={setTab} onQuick={() => { setSearch(''); setSheet('quick'); }}/>
    {sheet === 'manual' && accounts.data && accounts.data.length>0 && <ManualSheet accounts={accounts.data??[]} onClose={()=>setSheet(null)}/>}
    {sheet === 'update' && <UpdateAccounts accounts={accounts.data??[]} batches={statementData.data??[]} today={localDay()} onClose={()=>setSheet(null)} onImport={()=>{setTab('Ledger');setSheet(null);setImportRequest(n=>n+1);}}/>}
    {sheet === 'notices' && <NoticeReview accounts={accounts.data ?? []} onClose={() => setSheet(null)}/>}
    {sheet === 'account' && <AccountSheet onClose={() => setSheet(null)} onSaved={() => { setTab('Ledger'); setToast('Account saved on this device.'); }}/>}
    {sheet === 'quick' && <Sheet title="Quick" onClose={() => setSheet(null)}><Input label="Find an action" placeholder="Search actions or screens" value={search} onChange={e => setSearch(e.target.value)}/><div className="action-list">{quickActions.map(action => <Button key={action.label} onClick={action.act}><action.icon size={18}/><span style={{ flex: 1, textAlign: 'left' }}>{action.label}</span><ChevronRight size={16}/></Button>)}</div>{!quickActions.length && <p className="section-gap"><Search size={16}/> No matching action. Try “account” or “settings”.</p>}<p className="meta section-gap">Find a transaction in Ledger, or stage statement files for review.</p></Sheet>}
    {toast && <Toast message={toast} onDismiss={dismissToast}/>}
  </div>;
}

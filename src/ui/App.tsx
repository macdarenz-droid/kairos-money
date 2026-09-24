import { ManualHistory, ManualSheet } from './screens/Manual';
import { capturedNotices, forgetNotices, routeNotices } from '../ingest/notices';
import { applyShadeDecisions, shadeBatch } from './notices';
import { NoticeReview } from './screens/NoticeReview';
import {useQuickAddLaunch, useQuickAddOutbox} from './quick-add';
import { NotificationSync } from './screens/Notifications';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Account } from '../core/db/repository';
import { create } from 'zustand';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, ArrowLeftRight, ChevronRight, Coins, Download, FileText, LockKeyhole, Plus, Search, ShieldCheck, ShieldPlus, WalletCards } from 'lucide-react';
import { currency, fromDatabase, money } from '../core/money';
import { Amount, Button, EmptyState, Input, Row, Sheet, Skeleton, Tabs, Toast, type Tab } from './design/primitives';
import { followSystem } from './design/theme';
import { useSession } from './session';
import { Brand, LockScreen } from './screens/Lock';
import { CombinedTotal } from './design/CombinedTotal';
import { DoubleCounted } from './design/DoubleCounted';
import { Unconverted } from './design/Unconverted';
import { MoneyBand } from './design/MoneyBand';
import { SavingsPath } from './design/SavingsPath';
import { Surfaces } from './design/Surfaces';
import { Insights } from './screens/Insights';
import { TodayTriage, WeekStrip } from './screens/Today';
import { AccountSheet } from './screens/AccountSheet';
import { coveredDays } from '../ingest/reconcile';
const ImportWorkspace=lazy(()=>import('./screens/ImportWorkspace').then(module=>({default:module.ImportWorkspace})));
const BulkProposals=lazy(()=>import('./screens/BulkProposals').then(module=>({default:module.BulkProposals})));
const NetWorth=lazy(()=>import('./screens/NetWorth').then(module=>({default:module.NetWorth})));
const Debts=lazy(()=>import('./screens/Debts').then(module=>({default:module.Debts})));
const People=lazy(()=>import('./screens/People').then(module=>({default:module.People})));
import {Settings, type SettingsFocus} from './screens/Settings';
import {Rates} from './screens/Rates';
import {useConverter} from './currency';
const useNavigation = create<{ tab: Tab; setTab: (tab: Tab) => void }>(set => ({ tab: 'Today', setTab: tab => set({ tab }) }));
// Left to right, as they sit in the tab bar. Travelling right brings a screen in from the right.
const TAB_ORDER = ['Today', 'Ledger', 'Insights', 'You'] as const satisfies readonly Tab[];
export default function App() {
  const { tab, setTab } = useNavigation(); const session = useSession(); const queryClient = useQueryClient();
  // Every figure in the app is shown in one currency, including the ones on Ledger.
  const shown = useConverter();
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const primaryAccount = useQuery({ queryKey: ['primary-account'], enabled: session.state === 'ready', queryFn: () => session.run(repo => repo.notices.defaultAccount()) });
  const [sheet, setSheet] = useState<'quick' | 'account' | 'manual' | 'notices' | null>(null); const [search, setSearch] = useState(''); const [toast, setToast] = useState('');
  const [importRequest, setImportRequest] = useState(0);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus | null>(null);
  const clearFocus = useCallback(() => setSettingsFocus(null), []);
  // Which way the screen should come in. Derived during render rather than in an effect: the wrapper
  // is keyed by tab, so it mounts once and its animation starts immediately — a direction arriving one
  // render later would either be missed or would restart the animation half way through. Held in a ref
  // so that re-rendering the SAME tab cannot swap the animation-name under a running animation.
  const nav = useRef<{ tab: Tab; direction: 'forward' | 'back' }>({ tab, direction: 'forward' });
  if (nav.current.tab !== tab) nav.current = { tab, direction: TAB_ORDER.indexOf(tab) < TAB_ORDER.indexOf(nav.current.tab) ? 'back' : 'forward' };
  const consumeImport = useCallback(() => setImportRequest(0), []);
  const dismissToast = useCallback(() => setToast(''), []);
  const [quickAddRequest,setQuickAddRequest]=useState<string|null>(null);
  // Which kind of transaction the sheet opens on. "Transfer between accounts" opened it on Expense,
  // so pressing it looked like it had done nothing at all.
  const [manualKind,setManualKind]=useState<'expense'|'income'|'transfer'>('expense');
  const openManualSheet=useCallback((kind:'expense'|'income'|'transfer'='expense')=>{setManualKind(kind);setSheet('manual');},[]);
  const openManual=useCallback((requestId:string)=>{setQuickAddRequest(requestId);setManualKind('expense');setSheet('manual');},[]);
  useEffect(followSystem, []);
  useEffect(() => { if (session.state !== 'ready' && session.state !== 'preview') { setSheet(null); setQuickAddRequest(null); setSearch(''); setToast(''); setSettingsFocus(null); } }, [session.state]);
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => session.run(repo => repo.accounts()), enabled: session.state === 'ready' });
  // What each account holds now, not what it opened with. Invalidated by every write, like the rest.
  const balances = useQuery({ queryKey: ['account-balances'], queryFn: () => session.run(repo => repo.accountBalances()), enabled: session.state === 'ready' });
  const quickAddDisplayed=(sheet==='manual'&&Boolean(accounts.data?.length))||(sheet==='account'&&accounts.data?.length===0);
  const quickAddError=useQuickAddLaunch(session.state==='ready',openManual,quickAddDisplayed?quickAddRequest:null);
  // What the bank announced while the app was closed. Asked once on opening and not again until there is
  // something new, because a prompt that reappears after being dismissed stops being read.
  const noticeQueue = useQuery({ queryKey: ['captured-notices'], queryFn: capturedNotices, enabled: session.state === 'ready' });
  const [noticesAsked, setNoticesAsked] = useState('');
  const statementData = useQuery({ queryKey: ['coverage-summary'], queryFn: () => session.run(repo => repo.imports.summaries()), enabled: session.state === 'ready' });
  useEffect(()=>{if(sheet==='manual' && accounts.data?.length===0)setSheet('account');},[sheet,accounts.data]);
  const firstAccount = accounts.data?.find(a => !a.archived_at);
  // Every notice is routed by the one rule the sheet and the shade share: named account, then the main
  // account, then the first whose currency it reads in. What waits to be asked is anything unanswered
  // that reads, plus anything approved in the shade that could NOT be recorded — that one is shown among
  // the messages that were not about a purchase, rather than carried silently for ever.
  const waitingIds = useMemo(() => {
    const routed = routeNotices(noticeQueue.data ?? [], accounts.data ?? [], primaryAccount.data);
    return [...routed.readable.filter(item => !item.notice.decision), ...routed.unreadable.filter(item => item.notice.decision === 'approved')]
      .map(item => item.notice.id).sort().join(',');
  }, [noticeQueue.data, accounts.data, primaryAccount.data]);
  const waitingNotices = waitingIds ? waitingIds.split(',').length : 0;
  // Answers given in the shade are carried out here, on the first unlock after they were given: this is
  // the earliest moment the encrypted ledger can receive them. Remembered BY ID, not as one flag: an
  // answer given while the app sat in the background is as new as the first one was.
  // What was typed into the home-screen widget while the app was closed: recorded now, and said once.
  useQuickAddOutbox(session.state === 'ready', session.run, accounts.data, primaryAccount.isPending ? undefined : primaryAccount.data ?? null,
    added => { setToast(added === 1 ? 'Recorded 1 transaction from the widget' : `Recorded ${added} transactions from the widget`); void queryClient.invalidateQueries(); });
  const handledShade = useRef(new Set<string>());
  useEffect(()=>{
    if(!firstAccount || !noticeQueue.data || primaryAccount.isPending)return;
    const batch = shadeBatch(noticeQueue.data, handledShade.current);
    if(!batch.length)return;
    for(const notice of batch)handledShade.current.add(notice.id);
    void applyShadeDecisions(batch, accounts.data ?? [], primaryAccount.data,
      record => session.run(repo => repo.notices.approve(record)), forgetNotices)
      .then(async result => { if(result.approved)await queryClient.invalidateQueries(); })
      .catch(()=>{ for(const notice of batch)handledShade.current.delete(notice.id); });
  },[firstAccount,accounts.data,noticeQueue.data,primaryAccount.data,primaryAccount.isPending,session,queryClient]);
  // Asked once per set of waiting notices, not once per app lifetime: a new notification is a new question.
  useEffect(()=>{if(noticesAsked !== waitingIds && !sheet && waitingNotices>0){setNoticesAsked(waitingIds);setSheet('notices');}},[noticesAsked,sheet,waitingIds,waitingNotices]);
  const days = coveredDays((statementData.data ?? []).filter(b => b.status === 'committed' && !b.payslip).map(b => b.context.period));
  if (session.state !== 'ready' && session.state !== 'preview' && session.state !== 'background') return <LockScreen/>;
  const count = accounts.data?.length ?? 0;
  const accountAction = <Button variant="primary" onClick={() => setSheet('account')}><Plus size={16}/>Set up an account</Button>;
  // Verbs first, then navigation. Half of this list used to be "Open <tab>", which is movement rather than
  // an action; every one of them is still here, below the things a person opens this sheet to do.
  // Quick is the only index of what the app can do, so anything it omits is effectively missing. Backup,
  // restore and transfers were all built and all asked for again, because this list did not name them.
  const openSettings = (focus: SettingsFocus) => { setTab('You'); setSheet(null); setSettingsFocus(focus); };
  const quickActions = [{label:'Add transaction',icon:Plus,act:()=>openManualSheet()},{label:'Transfer between accounts',icon:ArrowLeftRight,act:()=>{ if (count < 2) { setSheet('account'); return; } openManualSheet('transfer'); }},{ label: 'Import statements', icon: FileText, act: () => { if (!count) { setSheet('account'); return; } setTab('Ledger'); setSheet(null); setImportRequest(n => n + 1); } },{ label: 'Add an account', icon: Plus, act: () => setSheet('account') }, { label: 'Find a transaction', icon: Search, act: () => { setTab('Ledger'); setSheet(null); } }, {label:'Back up your ledger',icon:ShieldPlus,act:()=>openSettings('backup')}, {label:'Restore a backup',icon:ArchiveRestore,act:()=>openSettings('restore')}, {label:'Change display currency',icon:Coins,act:()=>openSettings('currency')}, {label:'Export all data',icon:Download,act:()=>openSettings('export')}, {label:'Open settings',icon:ShieldCheck,act:()=>{setTab('You');setSheet(null);}}].filter(action => action.label.toLowerCase().includes(search.toLowerCase()));
  return <div className="app" aria-hidden={session.state === 'background' || undefined} style={session.state === 'background' ? { display: 'none' } : undefined}><header className="brand-bar"><Brand/><div className="privacy-status"><LockKeyhole size={12}/><span>{session.state === 'preview' ? 'Design preview' : 'On this device'}</span></div></header>
    <NotificationSync/>
    {session.state === 'preview' && <p className="notice">Account storage and security require the Android app.</p>}
    <main>{/* A heading names the screen. The sentence that used to sit under it described the app to itself and
        cost a line of every screen. */}
      <header className="screen-header"><div><h1>{tab}</h1></div>{tab === 'Ledger' && <Button variant="quiet" className="icon-button" aria-label="Add account" onClick={() => setSheet('account')}><Plus size={20}/></Button>}</header>
    {accounts.error && <p className="error" role="alert">Accounts could not be read. Lock and reopen Kairos before continuing.</p>}
    {quickAddError && <p className="error" role="alert">{quickAddError}</p>}
    <div className="screen" key={tab} data-direction={nav.current.direction}>
    {tab === 'Today' && <><Unconverted onFix={() => openSettings('currency')}/><MoneyBand/>{/* The one thing this app is for, directly under the figures it changes — not below four other cards at the size of a filter chip. */}<Button variant="primary" className="add-primary" onClick={()=>openManualSheet()}><Plus size={18}/>Add transaction</Button><TodayTriage/><SavingsPath/><Surfaces/><WeekStrip/><ManualHistory today/></>}
    {tab === 'Ledger' && <>{session.state === 'ready' && accounts.isPending ? <Skeleton label="Reading accounts"/> : count ? <><div className="list-heading"><h2>Accounts</h2><span className="meta">Balance now</span></div>{accounts.data?.map(account => { const held = balances.data?.find(b => b.accountId === account.id); return <Row key={account.id} trailing={<Amount value={shown.into(held?.minor ?? fromDatabase(account.opening_balance_minor, currency(account.currency)).minor.toString(), account.currency) ?? money(BigInt(held?.minor ?? fromDatabase(account.opening_balance_minor, currency(account.currency)).minor), currency(account.currency))} context={`${account.name} balance`}/>}>{/* The row was a caption. An account is the one thing on this screen a person most expects to be able to open, and nothing happened when he pressed it. */}<button type="button" className="account-open" onClick={() => setEditAccount(account)}><span className="account-summary"><span className="account-symbol"><WalletCards size={18}/></span><span><h3>{account.name}</h3><p className="account-meta">{account.currency}{account.mask_last4 ? ` · ••${account.mask_last4}` : ''}{primaryAccount.data === account.id && <span className="tag tag-primary">Primary</span>}{account.archived_at && <span className="tag">Closed</span>}</p></span></span><ChevronRight size={16}/></button></Row>; })}</> : <EmptyState icon={<FileText size={28} strokeWidth={1.3}/>} title="Add an account to import your statement" action={accountAction}>Start with the account your salary arrives in, then import its statements.</EmptyState>}<CombinedTotal accounts={accounts.data ?? []} balances={balances.data}/>{!(session.state==='ready' && accounts.isPending)&&<Suspense fallback={<Skeleton label="Opening imports"/>}><ImportWorkspace accounts={accounts.data ?? []} request={importRequest} consumed={consumeImport}/></Suspense>}</>}
    {tab === 'Ledger' && count>0 && <Suspense fallback={null}><BulkProposals/></Suspense>}
    {tab === 'Ledger' && <Suspense fallback={null}><Debts accounts={accounts.data??[]}/><People/></Suspense>}
    {tab === 'Insights' && <><Unconverted onFix={() => openSettings('currency')}/><DoubleCounted onReview={() => setTab('Ledger')}/><Insights/></>}
    {tab === 'You' && <>{/* "put at the very top of the you section": every figure in the app is shown in this currency, so the control that sets it comes before the figures rather than after them. */}<Rates accounts={accounts.data ?? []} notify={setToast}/><Row trailing={<span className="meta">{count}</span>}>Accounts set up</Row><Row trailing={<span className="meta">{days ? `${days} days of statement history` : 'No statements yet'}</span>}>Statement history</Row><Settings onAccount={() => setSheet('account')} notify={setToast} accounts={accounts.data ?? []} focus={settingsFocus} onFocused={clearFocus}/><Suspense fallback={null}><NetWorth/></Suspense></>}
    </div>
    </main><Tabs current={tab} onChange={setTab} onQuick={() => { setSearch(''); setSheet('quick'); }}/>
    {sheet === 'manual' && accounts.data && accounts.data.length>0 && <ManualSheet accounts={accounts.data??[]} kind={manualKind} onClose={()=>setSheet(null)}/>}
    {sheet === 'notices' && <NoticeReview accounts={accounts.data ?? []} onClose={() => setSheet(null)}/>}
    {sheet === 'account' && <AccountSheet onClose={() => setSheet(null)} onSaved={() => { setTab('Ledger'); setToast('Account saved on this device.'); }}/>}
    {editAccount && <AccountSheet account={editAccount} onClose={() => setEditAccount(null)} onSaved={() => setToast('Account updated on this device.')}/>}
    {sheet === 'quick' && <Sheet title="Quick" onClose={() => setSheet(null)}><Input label="Find an action" placeholder="Search actions or screens" value={search} onChange={e => setSearch(e.target.value)}/><div className="action-list">{quickActions.map(action => <Button key={action.label} onClick={action.act}><action.icon size={18}/><span style={{ flex: 1, textAlign: 'left' }}>{action.label}</span><ChevronRight size={16}/></Button>)}</div>{!quickActions.length && <p className="section-gap"><Search size={16}/> No matching action. Try “account” or “settings”.</p>}</Sheet>}
    {toast && <Toast message={toast} onDismiss={dismissToast}/>}
  </div>;
}

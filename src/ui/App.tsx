import { ManualHistory, ManualSheet } from './screens/Manual';
import {FirstImport} from './screens/FirstImport';
import {useQuickAddLaunch} from './quick-add';
import { NotificationSync } from './screens/Notifications';
import { Intelligence } from './screens/Intelligence';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
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
const NetWorth=lazy(()=>import('./screens/NetWorth').then(module=>({default:module.NetWorth})));
import {Settings} from './screens/Settings';
const useNavigation = create<{ tab: Tab; setTab: (tab: Tab) => void }>(set => ({ tab: 'Today', setTab: tab => set({ tab }) }));
export default function App() {
  const { tab, setTab } = useNavigation(); const session = useSession();
  const [sheet, setSheet] = useState<'quick' | 'account' | 'update' | 'manual' | null>(null); const [search, setSearch] = useState(''); const [toast, setToast] = useState('');
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
  const statementData = useQuery({ queryKey: ['coverage-summary'], queryFn: () => session.run(repo => repo.imports.batches()), enabled: session.state === 'ready' });
  useEffect(()=>{if(session.state==='ready' && accounts.data && statementData.data)void session.run(repo=>repo.imports.reminderDay()).then(day=>syncReminder(day,accounts.data!.map(a=>a.id),statementData.data!,localDay())).catch(()=>undefined);},[session.state,accounts.data,statementData.data]);
  useEffect(()=>{if(sheet==='manual' && accounts.data?.length===0)setSheet('account');},[sheet,accounts.data]);
  const days = coveredDays((statementData.data ?? []).filter(b => b.status === 'committed' && !b.payslip).map(b => b.context.period));
  if (session.state !== 'ready' && session.state !== 'preview' && session.state !== 'background') return <LockScreen/>;
  const count = accounts.data?.length ?? 0;
  const accountAction = <Button variant="primary" onClick={() => setSheet('account')}><Plus size={16}/>Set up an account</Button>;
  const quickActions = [{label:'Add transaction',icon:Plus,act:()=>setSheet('manual')},{label:'Update accounts',icon:FileText,act:()=>setSheet('update')},{ label: 'Import statements', icon: FileText, act: () => { if (!count) { setSheet('account'); return; } setTab('Ledger'); setSheet(null); setImportRequest(n => n + 1); } }, { label: 'Find a transaction', icon: Search, act: () => { setTab('Ledger'); setSheet(null); } }, { label: 'Add an account', icon: Plus, act: () => setSheet('account') }, ...(['Today', 'Ledger', 'Insights', 'You'] as const).map(t => ({ label: `Open ${t === 'You' ? 'settings' : t.toLowerCase()}`, icon: t === 'Today' ? CalendarDays : t === 'Ledger' ? FileText : t === 'Insights' ? Layers3 : ShieldCheck, act: () => { setTab(t); setSheet(null); } }))].filter(action => action.label.toLowerCase().includes(search.toLowerCase()));
  return <div className="app" aria-hidden={session.state === 'background' || undefined} style={session.state === 'background' ? { display: 'none' } : undefined}><header className="brand-bar"><Brand/><div className="privacy-status"><LockKeyhole size={12}/><span>{session.state === 'preview' ? 'Design preview' : 'On this device'}</span></div></header>
    <NotificationSync/>
    {session.state === 'preview' && <p className="notice">Account storage and security require the Android app.</p>}
    <main><header className="screen-header"><div><h1>{tab === 'You' ? 'Your money, your way' : tab}</h1><p>{tab === 'Today' ? 'A clearer view starts with your data.' : tab === 'Ledger' ? 'Every account. One place to understand it.' : tab === 'Insights' ? 'Patterns need evidence.' : 'A private ledger you control.'}</p></div>{tab === 'Ledger' && <Button variant="quiet" className="icon-button" aria-label="Add account" onClick={() => setSheet('account')}><Plus size={20}/></Button>}</header>
    {accounts.error && <p className="error" role="alert">Accounts could not be read. Lock and reopen Kairos before continuing.</p>}
    {quickAddError && <p className="error" role="alert">{quickAddError}</p>}
    {tab === 'Today' && <>{session.state==='ready'&&days===0&&<FirstImport hasAccount={count>0} loading={accounts.isPending} onAccount={()=>setSheet('account')} onRead={()=>{setTab('Ledger');setImportRequest(n=>n+1);}}/>}<Button variant="primary" onClick={()=>setSheet('manual')}>Add transaction</Button><ManualHistory accounts={accounts.data??[]} today/><Button onClick={()=>setTab('Insights')}>See spending patterns</Button><Intelligence mode="today"/><Freshness accounts={accounts.data??[]} batches={statementData.data??[]} today={localDay()} onUpdate={()=>setSheet('update')}/><Row trailing={<span className="meta">{count}</span>}>Accounts set up</Row><Row trailing={<span className="meta">{days ? `${days} covered days` : 'No statements yet'}</span>}>Statement coverage</Row><div className="information"><ShieldCheck size={15}/><p>You stay in control. Every statement stays in staging until you confirm its review.</p></div></>}
    {tab === 'Ledger' && <>{session.state === 'ready' && accounts.isPending ? <Skeleton label="Reading accounts"/> : count ? <><div className="list-heading"><h2>Accounts</h2><span className="meta">Opening balances</span></div>{accounts.data?.map(account => <Row key={account.id} trailing={<Amount value={fromDatabase(account.opening_balance_minor, currency(account.currency))} context={`${account.name} opening balance`}/>}><div className="account-summary"><span className="account-symbol"><WalletCards size={18}/></span><div><h3>{account.name}</h3><p>{account.currency}{account.mask_last4 ? ` · ••${account.mask_last4}` : ''}</p></div></div></Row>)}</> : <EmptyState icon={<FileText size={28} strokeWidth={1.3}/>} title="Add an account to import your statement" action={accountAction}>Start with the account your salary arrives in, then import its statements.</EmptyState>}{!(session.state==='ready' && accounts.isPending)&&<Suspense fallback={<Skeleton label="Opening imports"/>}><ImportWorkspace accounts={accounts.data ?? []} request={importRequest} consumed={consumeImport}/></Suspense>}</>}
    {tab === 'Ledger' && count>0 && <><Button onClick={()=>setSheet('manual')}>Add transaction</Button><ManualHistory accounts={accounts.data??[]}/></>}
    {tab === 'Insights' && <><Suspense fallback={<Skeleton label="Opening spending patterns"/>}><SpendingPatterns/></Suspense><Intelligence/></>}
    {tab === 'You' && <><Suspense fallback={<Skeleton label="Opening your money views"/>}><MoneyVisuals/><NetWorth/></Suspense><Settings onAccount={() => setSheet('account')} notify={setToast}/></>}
    </main><Tabs current={tab} onChange={setTab} onQuick={() => { setSearch(''); setSheet('quick'); }}/>
    {sheet === 'manual' && accounts.data && accounts.data.length>0 && <ManualSheet accounts={accounts.data??[]} onClose={()=>setSheet(null)}/>}
    {sheet === 'update' && <UpdateAccounts accounts={accounts.data??[]} batches={statementData.data??[]} today={localDay()} onClose={()=>setSheet(null)} onImport={()=>{setTab('Ledger');setSheet(null);setImportRequest(n=>n+1);}}/>}
    {sheet === 'account' && <AccountSheet onClose={() => setSheet(null)} onSaved={() => { setTab('Ledger'); setToast('Account saved on this device.'); }}/>}
    {sheet === 'quick' && <Sheet title="Quick" onClose={() => setSheet(null)}><Input label="Find an action" placeholder="Search actions or screens" value={search} onChange={e => setSearch(e.target.value)}/><div className="action-list">{quickActions.map(action => <Button key={action.label} onClick={action.act}><action.icon size={18}/><span style={{ flex: 1, textAlign: 'left' }}>{action.label}</span><ChevronRight size={16}/></Button>)}</div>{!quickActions.length && <p className="section-gap"><Search size={16}/> No matching action. Try “account” or “settings”.</p>}<p className="meta section-gap">Find a transaction in Ledger, or stage statement files for review.</p></Sheet>}
    {toast && <Toast message={toast} onDismiss={dismissToast}/>}
  </div>;
}

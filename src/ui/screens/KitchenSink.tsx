import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Amount, Button, EmptyState, Input, Label, Row, Sheet, Skeleton, Surface, Switch, Tabs, Toast, type Tab } from '../design/primitives';
import { followSystem, useTheme } from '../design/theme';
import { ThemeChoices } from '../design/ThemeChoices';
import { money } from '../../core/money';
import { Coin, CountUp, KairosAiMark, KairosAiWorking, Loader } from '../design/Motion';
import { FlowBar } from '../design/FlowBar';
export default function KitchenSink() {
  const theme = useTheme(); const [sheet, setSheet] = useState(false); const [toast, setToast] = useState(false); const [tab, setTab] = useState<Tab>('Today'); const [busy, setBusy] = useState(false); const [minor, setMinor] = useState(125090n); const [saved, setSaved] = useState(false); const [on, setOn] = useState(true); const [off, setOff] = useState(false);
  useEffect(followSystem, []);
  return <div className="app"><header className="screen-header"><div><h1>Design system</h1><p>Development only · synthetic amounts below</p></div></header><ThemeChoices preference={theme.preference} choose={theme.set}/>
    <section className="kitchen-section"><h2>Surface, row, label and amount</h2><Surface><Label>Example balance</Label><Amount value={money(125090n, 'AUD')} hero context="Synthetic example balance"/><Row trailing={<Amount value={money(-4200n, 'AUD')} context="Synthetic groceries"/>}>Synthetic groceries<p>Raw reference is not financial data.</p></Row><Row trailing={<Label muted>11 / 16</Label>}>Metadata</Row></Surface></section>
    <section className="kitchen-section"><h2>Buttons</h2><div className="kitchen-buttons"><Button variant="primary" onClick={() => setToast(true)}>Primary action</Button><Button onClick={() => setSheet(true)}>Open sheet</Button><Button variant="quiet" onClick={() => setToast(true)}>Quiet action</Button><Button variant="danger" onClick={() => setToast(true)}>Destructive action</Button><Button disabled>Unavailable</Button></div></section>
    <section className="kitchen-section"><h2>Switch</h2><Row trailing={<Switch label="Example switch, on" on={on} onChange={() => setOn(v => !v)}/>}>Example switch, on</Row><Row trailing={<Switch label="Example switch, off" on={off} onChange={() => setOff(v => !v)}/>}>Example switch, off</Row></section>
    <section className="kitchen-section"><h2>Input</h2><Input label="Example account name" hint="This field does not save anything." placeholder="Everyday account"/></section>
    <section className="kitchen-section"><h2>Empty state</h2><EmptyState icon={<FileText size={24}/>} title="No statements yet" action={<Button onClick={() => setSheet(true)}>View example</Button>}>This example contains no imported financial data.</EmptyState></section>
    <section className="kitchen-section"><h2>Motion</h2><div className="stack">
      <div className="kitchen-buttons"><Button variant="primary" busy={busy} busyLabel="Saving…" onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 3000); }}>Busy for 3 seconds</Button><Coin/></div>
      <Loader label="Example coin stack"/>
      <div className="kitchen-buttons"><KairosAiMark size={12}/><KairosAiMark size={20}/><KairosAiMark size={36} thinking/></div><KairosAiWorking kind="sort"/><KairosAiWorking kind="review"/>
      <p className="hero-amount"><CountUp value={money(minor, 'AUD')}/></p><Button onClick={() => setMinor(value => value === 125090n ? 98765n : 125090n)}>Change the amount</Button>
      <FlowBar flow={{ inMinor: '420000', outMinor: '310050' }} code="AUD" label="Synthetic month"/>
      <Button onClick={() => setSaved(true)}>Show a saved toast</Button>
    </div></section>
    <section className="kitchen-section"><h2>Skeleton</h2><Skeleton label="Example loading state"/></section>
    <Tabs current={tab} onChange={setTab} onQuick={() => setSheet(true)}/>{sheet && <Sheet title="Example sheet" onClose={() => setSheet(false)}><div className="stack"><p>A labelled modal with a trapped keyboard focus and Escape to close.</p><Input label="Example input"/><Button variant="primary" onClick={() => setSheet(false)}>Done</Button></div></Sheet>}{toast && <Toast message="Example confirmation. Nothing was saved." onDismiss={() => setToast(false)}/>}{saved && <Toast saved message="Example saved. Nothing was stored." onDismiss={() => setSaved(false)}/>}
  </div>;
}

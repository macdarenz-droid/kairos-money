import {useEffect, useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Row, Switch} from '../design/primitives';
import {useBrain} from '../money';
import {useDisplayCurrency} from '../currency';
import {readWidgetSettings, saveWidgetSettings, useWidgetFigures, widgetStyles, type WidgetSettings as Settings, type WidgetStyle} from '../widgets';

/** Keeps the home-screen widgets on this unlock's figures. */
export function WidgetSync() {
  const brain = useBrain(), code = useDisplayCurrency();
  useWidgetFigures(brain.data, code);
  return null;
}

/** You › Appearance: how the home-screen widgets look, and whether they show amounts. */
export function WidgetSettings() {
  const [settings, setSettings] = useState<Settings | null>(null), [error, setError] = useState('');
  useEffect(() => { void readWidgetSettings().then(setSettings); }, []);
  if (!Capacitor.isNativePlatform() || !settings) return null;
  async function change(next: Settings) {
    setError('');
    try { await saveWidgetSettings(next); setSettings(next); } catch { setError('The widget setting could not be saved. Try again.'); }
  }
  return <>
    <Row trailing={<select aria-label="Widget style" value={settings.style} onChange={e => void change({...settings, style: e.target.value as WidgetStyle})}>
      {widgetStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</select>}>Widget style</Row>
    <Row trailing={<Switch label="Show amounts on widgets" on={settings.showAmounts} onChange={() => void change({...settings, showAmounts: !settings.showAmounts})}/>}>
      Show amounts on widgets<p>From your last unlock. Off keeps them off the home screen.</p></Row>
    {error && <p role="alert">{error}</p>}
  </>;
}

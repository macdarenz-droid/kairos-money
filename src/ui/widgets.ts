import {Capacitor, registerPlugin} from '@capacitor/core';
import {useEffect} from 'react';
import {currency, format, money} from '../core/money';
import {displayRatio} from '../intelligence/visuals';
import type {Brain} from '../brain/types';

export type WidgetStyle = 'glass' | 'paper' | 'indigo';
export type WidgetSettings = {style: WidgetStyle; showAmounts: boolean};
export type WidgetFigures = {left: string | null; spent: string | null; bars: number[]};
export const widgetStyles: readonly {id: WidgetStyle; name: string}[] = [{id: 'glass', name: 'Dark glass'}, {id: 'paper', name: 'Paper'}, {id: 'indigo', name: 'Indigo'}];

const Widgets = registerPlugin<{
  widgetSettings(): Promise<WidgetSettings>;
  setWidgetSettings(settings: WidgetSettings): Promise<void>;
  widgetFigures(figures: WidgetFigures): Promise<void>;
}>('KairosQuickAdd');
const native = () => Capacitor.isNativePlatform();

/** What the home-screen widgets show: formatted text and whole-percent bar heights, never raw amounts. */
export function widgetFigures(brain: Brain, code: string): WidgetFigures {
  const shown = (minor: string) => format(money(BigInt(minor), currency(code)));
  const days = brain.spending.days.slice(-7);
  const peak = days.reduce((most, d) => BigInt(d.outMinor) > most ? BigInt(d.outMinor) : most, 0n);
  // Dimensionless: displayRatio gives millionths of the busiest day. A spend never draws as nothing.
  const percent = (out: bigint): number => {
    if (out <= 0n || peak === 0n) return 0;
    const millionths = Number(displayRatio(out.toString(), peak.toString()));
    return Math.max(4, Math.round(millionths / 10000));
  };
  const bars = days.map(d => percent(BigInt(d.outMinor)));
  return {left: brain.today.status === 'ok' ? shown(brain.today.spendTodayMinor) : null, spent: days.length ? shown(days.at(-1)!.outMinor) : null, bars};
}

export async function readWidgetSettings(): Promise<WidgetSettings> {
  if (!native()) return {style: 'glass', showAmounts: true};
  try { return await Widgets.widgetSettings(); } catch { return {style: 'glass', showAmounts: true}; }
}
export async function saveWidgetSettings(settings: WidgetSettings): Promise<void> { if (native()) await Widgets.setWidgetSettings(settings); }

/** Hands the widgets the figures from this unlock; they keep them until the next one. */
export function useWidgetFigures(brain: Brain | undefined, code: string) {
  useEffect(() => {
    if (!brain || !native()) return;
    // A widget that cannot be updated keeps its old figures; the app carries on.
    void Promise.resolve().then(() => Widgets.widgetFigures(widgetFigures(brain, code))).catch(() => undefined);
  }, [brain, code]);
}

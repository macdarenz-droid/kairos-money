// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

const plugin = vi.hoisted(() => ({saved: [] as unknown[], widgetSettings: vi.fn(async () => ({style: 'glass', showAmounts: true}))}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: () => ({
  widgetSettings: plugin.widgetSettings, setWidgetSettings: async (s: unknown) => { plugin.saved.push(s); }, widgetFigures: async () => undefined})}));
vi.mock('../src/ui/money', () => ({useBrain: () => ({data: undefined})}));
vi.mock('../src/ui/currency', () => ({useDisplayCurrency: () => 'AUD'}));
const {WidgetSettings} = await import('../src/ui/screens/WidgetSettings');
afterEach(cleanup);

it('offers the three widget styles, Dark glass first, and a switch that hides amounts', async () => {
  render(<WidgetSettings/>);
  const style = await screen.findByLabelText('Widget style') as HTMLSelectElement;
  expect([...style.options].map(o => o.textContent)).toEqual(['Dark glass', 'Paper', 'Indigo']);
  expect(style.value).toBe('glass');
  fireEvent.change(style, {target: {value: 'paper'}});
  await waitFor(() => expect(plugin.saved.at(-1)).toEqual({style: 'paper', showAmounts: true}));
  const amounts = screen.getByRole('button', {name: 'Show amounts on widgets'});
  expect(amounts.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(amounts);
  await waitFor(() => expect(plugin.saved.at(-1)).toEqual({style: 'paper', showAmounts: false}));
});

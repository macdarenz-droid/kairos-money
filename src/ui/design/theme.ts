import { create } from 'zustand';
export type ThemePreference = 'system' | 'dark' | 'light';
function initial(): ThemePreference {
  try { const value = localStorage.getItem('kairos-theme'); return value === 'dark' || value === 'light' ? value : 'system'; } catch { return 'system'; }
}
export const useTheme = create<{ preference: ThemePreference; set: (value: ThemePreference) => void }>(set => ({
  preference: initial(),
  set(value) { try { localStorage.setItem('kairos-theme', value); } catch { /* The current session still follows the selected theme. */ } applyTheme(value); set({ preference: value }); },
}));
export function applyTheme(preference: ThemePreference): void {
  const resolved = preference === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : preference;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#FCFCFD' : '#08090A');
}
export function followSystem(): () => void {
  const media = matchMedia('(prefers-color-scheme: light)'); const handler = () => applyTheme(useTheme.getState().preference);
  media.addEventListener('change', handler); handler(); return () => media.removeEventListener('change', handler);
}

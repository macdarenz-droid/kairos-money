import { create } from 'zustand';
import { THEMES, type ThemeId } from './theme-registry';
export { THEMES, type ThemeId } from './theme-registry';
export type ThemePreference = 'system' | ThemeId;
/** Anything unknown, including a missing or unreadable value, means follow the system. */
export function parsePreference(value: string | null): ThemePreference {
  return value !== null && THEMES.some(theme => theme.id === value) ? value as ThemeId : 'system';
}
function initial(): ThemePreference {
  try { return parsePreference(localStorage.getItem('kairos-theme')); } catch { return 'system'; }
}
export const useTheme = create<{ preference: ThemePreference; set: (value: ThemePreference) => void }>(set => ({
  preference: initial(),
  set(value) { try { localStorage.setItem('kairos-theme', value); } catch { /* The current session still follows the selected theme. */ } applyTheme(value); set({ preference: value }); },
}));
/** System resolves only to dark or light; the other themes are chosen, never inferred. */
export function resolveTheme(preference: ThemePreference): ThemeId {
  return preference === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : preference;
}
export function applyTheme(preference: ThemePreference): void {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find(theme => theme.id === resolved)!.background);
}
export function followSystem(): () => void {
  const media = matchMedia('(prefers-color-scheme: light)'); const handler = () => applyTheme(useTheme.getState().preference);
  media.addEventListener('change', handler); handler(); return () => media.removeEventListener('change', handler);
}

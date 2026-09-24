// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';

const native = vi.hoisted(() => ({repo: undefined as Repository | undefined, themes: [] as string[], fail: false}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: async <T,>(fn: (repo: Repository) => Promise<T>) => fn(native.repo!)})}));
vi.mock('@capacitor/core', async importOriginal => ({...await importOriginal<typeof import('@capacitor/core')>(), Capacitor: {isNativePlatform: () => true, getPlatform: () => 'android'}}));
vi.mock('../src/core/crypto/native', () => ({Vault: new Proxy({}, {get: (_, name) => name === 'setTheme'
  ? async ({theme}: {theme: string}) => { if (native.fail) throw new Error('disk full'); native.themes.push(theme); }
  : async () => ({})})}));
import {Settings} from '../src/ui/screens/Settings';
import {useTheme} from '../src/ui/design/theme';

beforeEach(async () => {
  const {driver} = memoryDriver(); await migrate(driver); native.repo = repository(driver); native.themes = []; native.fail = false;
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
  document.head.innerHTML = '<meta name="theme-color" content="#08090A">';
  localStorage.clear(); useTheme.setState({preference: 'system'});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={new QueryClient()}><Settings onAccount={() => {}} notify={() => {}}/></QueryClientProvider>);
const appearance = () => within(screen.getByRole('heading', {name: 'Appearance'}).parentElement!);

describe('the Appearance picker', () => {
  it('offers System and the five themes, with exactly one pressed', () => {
    mount();
    const buttons = appearance().getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['System', 'Dark', 'Light', 'True black', 'Paper', 'High contrast']);
    expect(buttons.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)).toEqual(['System']);
    expect(buttons.slice(1).every(b => b.querySelector('.theme-swatch[aria-hidden=true]'))).toBe(true);
  });

  it('applies a chosen theme to the page, the meta colour, storage and the phone', async () => {
    mount();
    fireEvent.click(appearance().getByRole('button', {name: 'Paper'}));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('paper'));
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#EFE9DF');
    expect(localStorage.getItem('kairos-theme')).toBe('paper');
    expect(native.themes).toEqual(['paper']);
    expect(appearance().getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)).toEqual(['Paper']);
  });

  it('says so when the phone cannot save it', async () => {
    native.fail = true; mount();
    fireEvent.click(appearance().getByRole('button', {name: 'High contrast'}));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Appearance could not be saved/);
    expect(localStorage.getItem('kairos-theme')).toBeNull();
  });
});

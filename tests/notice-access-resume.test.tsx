// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {act, cleanup, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

const box = vi.hoisted(() => ({state: 'ready', granted: false}));
vi.mock('../src/ingest/notices', () => ({Notices: {openSettings: async () => undefined}, noticesAvailable: () => true,
  noticeAccess: async () => ({granted: box.granted, sources: []}), installedSources: async () => [], watchSources: async () => undefined}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: box.state, run: async () => null})}));
const {NoticeSettings} = await import('../src/ui/screens/NoticeSettings');
afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

it('shows the access as granted when the owner comes back from Android settings', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const ui = () => <QueryClientProvider client={client}><NoticeSettings/></QueryClientProvider>;
  const view = render(ui());
  await screen.findByText(/^Not granted/);
  // Leaving for Android settings backgrounds Kairos: the session clears every cached read, as it does on device.
  box.state = 'background'; client.clear(); view.rerender(ui()); await flush();
  box.granted = true;
  box.state = 'ready'; view.rerender(ui()); await flush();
  expect(await screen.findByText(/^Granted/)).toBeTruthy();
});

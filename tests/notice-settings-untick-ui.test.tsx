// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

vi.mock('../src/ingest/notices', () => ({Notices: {openSettings: async () => undefined}, noticesAvailable: () => true,
  noticeAccess: async () => ({granted: true, sources: ['com.synthetic.bank']}),
  installedSources: async () => [{id: 'com.synthetic.bank', label: 'Synthetic Bank'}], watchSources: async () => undefined}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: async () => null})}));
const {NoticeSettings} = await import('../src/ui/screens/NoticeSettings');
afterEach(cleanup);

it('unticking an app refreshes the held notices so the Today count drops at once', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const refresh = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><NoticeSettings/></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('checkbox'));
  await waitFor(() => expect(refresh).toHaveBeenCalledWith({queryKey: ['captured-notices']}));
});

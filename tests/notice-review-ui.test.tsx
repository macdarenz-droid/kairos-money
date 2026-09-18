// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NoticeReview} from '../src/ui/screens/NoticeReview';
import type {Notice} from '../src/ingest/notices/parse';

const captured = vi.hoisted(() => ({notices: [] as Notice[], forgotten: [] as string[]}));
const approved = vi.hoisted(() => ({calls: [] as unknown[], fail: false}));

vi.mock('../src/ingest/notices', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../src/ingest/notices')),
  capturedNotices: () => Promise.resolve(captured.notices),
  forgetNotices: (ids: string[]) => { captured.forgotten.push(...ids); return Promise.resolve(); },
}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready',
  run: (fn: (repo: {notices: {approve: (e: unknown) => Promise<unknown>}}) => Promise<unknown>) =>
    fn({notices: {approve: e => { if (approved.fail) return Promise.reject(new Error('Storage is locked.')); approved.calls.push(e); return Promise.resolve(e); }}}),
})}));

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

const accounts = [{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null}] as never;
const notice = (over: Partial<Notice> = {}): Notice => ({id: 'n1', source: 'app.bank', title: 'Synthetic Bank',
  text: 'You spent $12.50 at WOOLWORTHS 1234.', postedAt: Date.parse('2026-08-26T04:15:00Z'), ...over});

beforeEach(() => { captured.notices = []; captured.forgotten = []; approved.calls = []; approved.fail = false; });
afterEach(cleanup);

const show = async () => {
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
    <NoticeReview accounts={accounts} onClose={() => undefined}/></QueryClientProvider>);
  await screen.findByText('Check these transactions');
};

it('lists every captured purchase in one sheet, not one prompt after another', async () => {
  captured.notices = [notice(), notice({id: 'n2', text: 'You spent $8.00 at CAFE MIKA.'}),
    notice({id: 'n3', text: 'You spent $31.20 at SYNTHETIC FUEL.'})];
  await show();
  await waitFor(() => expect(screen.getAllByRole('button', {name: 'Approve'})).toHaveLength(3));
  expect(screen.getAllByRole('button', {name: 'Reject'})).toHaveLength(3);
  expect(screen.getByRole('button', {name: 'Approve all 3'})).toBeTruthy();
});

it('records nothing until a row is approved', async () => {
  captured.notices = [notice()];
  await show();
  await screen.findByText('WOOLWORTHS 1234');
  // Seeing a notification is not agreeing to it.
  expect(approved.calls).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', {name: 'Approve'}));
  await waitFor(() => expect(approved.calls).toHaveLength(1));
  expect(approved.calls[0]).toMatchObject({accountId: 'a', minor: '-1250', merchant: 'WOOLWORTHS 1234', date: '2026-08-26'});
});

it('records nothing at all when a row is rejected, and does not ask again', async () => {
  captured.notices = [notice()];
  await show();
  await screen.findByText('WOOLWORTHS 1234');
  fireEvent.click(screen.getByRole('button', {name: 'Reject'}));
  await waitFor(() => expect(captured.forgotten).toEqual(['n1']));
  expect(approved.calls).toHaveLength(0);
  expect(screen.queryByText('WOOLWORTHS 1234')).toBeNull();
});

it('answers one row without answering the others', async () => {
  captured.notices = [notice(), notice({id: 'n2', text: 'You spent $8.00 at CAFE MIKA.'})];
  await show();
  await waitFor(() => expect(screen.getAllByRole('button', {name: 'Approve'})).toHaveLength(2));
  fireEvent.click(screen.getAllByRole('button', {name: 'Approve'})[0]!);
  await waitFor(() => expect(screen.getAllByRole('button', {name: 'Approve'})).toHaveLength(1));
  expect(screen.getByText('CAFE MIKA')).toBeTruthy();
  expect(approved.calls).toHaveLength(1);
});

it('says what it could not read rather than dropping it silently', async () => {
  // A notification the app cannot read must look like a gap, not like a purchase that never happened.
  captured.notices = [notice(), notice({id: 'n2', text: 'Your available balance is $431.20.'})];
  await show();
  await waitFor(() => expect(screen.getAllByRole('button', {name: 'Approve'})).toHaveLength(1));
  expect(screen.getByText(/1 message was not about a purchase/)).toBeTruthy();
});

it('keeps the row and says so when recording fails', async () => {
  approved.fail = true;
  captured.notices = [notice()];
  await show();
  await screen.findByText('WOOLWORTHS 1234');
  fireEvent.click(screen.getByRole('button', {name: 'Approve'}));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Storage is locked.'));
  // Nothing was forgotten, so the purchase can still be answered next time.
  expect(captured.forgotten).toEqual([]);
  expect(screen.getByText('WOOLWORTHS 1234')).toBeTruthy();
});

it('says plainly when the bank has told it nothing', async () => {
  await show();
  await waitFor(() => expect(screen.getByText('Nothing new from your bank to check.')).toBeTruthy());
});

it('lists a peso receipt on the peso wallet when the dollar account sorts first, and records it there', async () => {
  // The sheet read every notice in the FIRST account's currency, so on a phone with a dollar bank and a
  // peso wallet, money received in pesos was "not about a purchase" and never offered.
  const two = [{id: 'a', name: 'Everyday', currency: 'AUD', archived_at: null, mask_last4: null},
    {id: 'w', name: 'Wallet', currency: 'PHP', archived_at: null, mask_last4: null}] as never;
  captured.notices = [notice({id: 'in1', title: 'Synthetic Wallet',
    text: 'You have received PHP 500.00 from JUAN D. Your new balance is PHP 1,500.00.'})];
  render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
    <NoticeReview accounts={two} onClose={() => undefined}/></QueryClientProvider>);
  await screen.findByText('JUAN D');
  expect(screen.getByText('PHP 500.00')).toBeTruthy();
  // Only one account holds pesos, so there is nothing to choose between: no picker.
  expect(screen.queryByLabelText(/Paid into/)).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Approve'}));
  await waitFor(() => expect(approved.calls).toHaveLength(1));
  expect(approved.calls[0]).toMatchObject({accountId: 'w', minor: '50000'});
});

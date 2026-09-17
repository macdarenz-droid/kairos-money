// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';
import {ImportWorkspace} from '../src/ui/screens/ImportWorkspace';
import {localDay} from '../src/ingest/reminders';

const state = vi.hoisted(() => ({repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown>}));
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; }})}));
vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => true}, registerPlugin: () => ({})}));

const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD',
  period: {start: '2026-01-01', end: '2026-01-31'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};

/** Statement rows, so History has something from a file to sit the hand-recorded ones beside. */
async function importRows(count: number) {
  const doc: Document = {id: hash(JSON.stringify(['a', hash('file')])), hash: hash('file'), fileName: 'synthetic.csv',
    parser: 'synthetic', context, opening: '0', closing: String(-count * 100), payslip: null,
    rows: Array.from({length: count}, (_, i) => ({
      ...normalizeRow({sourceId: String(i), date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        description: `Synthetic import ${i}`, amount: '-1.00', confidence: 10000}, context),
      category: 'Shopping', verified: true})),
  };
  await state.repo!.imports.stage(doc);
  await state.repo!.imports.commit(doc.id);
}

beforeEach(async () => {
  const {driver} = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({id: 'a', name: 'Synthetic account', type: 'checking', currency: 'AUD',
    institution: 'Synthetic bank', mask_last4: null, opening_balance_minor: 0n});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

let client: QueryClient;
async function open() {
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}>
    <ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={() => undefined}/>
  </QueryClientProvider>);
}
const rows = () => Array.from(document.querySelectorAll('button.transaction-row'));

/**
 * Money typed in by hand, money a bank notification announced and money read off a statement were three
 * lists in three places. A purchase is not a different KIND of thing because of how it reached the app.
 */
it('shows a hand-recorded purchase in the same list as an imported one', async () => {
  await importRows(1);
  await state.repo!.manual.save({id: 'by-hand', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  await open();
  await screen.findByText('Synthetic lunch');
  // Imported descriptions arrive normalised to upper case; the hand-recorded one is kept as typed.
  await screen.findByText('SYNTHETIC IMPORT 0');
  // Named for what it is, so a row with no statement behind it never looks like one that has.
  expect(screen.getByText(/Recorded by hand/)).toBeTruthy();
});

/**
 * FROM HIS SCREENSHOT: "remove here, sort. awkward positioning in between previous and next" — the row
 * count sat wedged between Previous and Next, and five rows a page made 74 pages of his own history.
 * The list grows downward instead: what has been read stays read, and the count moved up to the heading.
 */
it('loads more rather than paging, and keeps the rows already read', async () => {
  await importRows(30);
  await open();
  await waitFor(() => expect(rows()).toHaveLength(10));
  expect(screen.getByText('30 transactions')).toBeTruthy();
  expect(screen.getByText('Showing 10 of 30')).toBeTruthy();
  // Nothing steps backwards, because nothing was taken away.
  expect(screen.queryByRole('button', {name: 'Previous'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Next'})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
  await waitFor(() => expect(rows()).toHaveLength(20));
  // What was read stays read: the second press adds to the list rather than replacing it.
  fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
  await waitFor(() => expect(rows()).toHaveLength(30));
  // Everything is shown, so there is nothing left to offer.
  expect(screen.queryByRole('button', {name: 'Load more'})).toBeNull();
});

/**
 * FROM HIS SCREEN: "currency working now, but only in today section. not in ledger, not in insights."
 *
 * The tiles converted because MoneyBand had been taught to; History printed whatever currency each row
 * was recorded in, so one screen said PHP and the next said A$. It converts now — and at the rate for the
 * row's OWN day, which is the part that cannot be got wrong quietly: a purchase made in January is worth
 * what it was worth in January, not what today's rate would make of it.
 */
it('shows each row in the display currency, at the rate for its own date', async () => {
  await state.repo!.setDisplayCurrency('PHP');
  await state.repo!.saveRates([
    {asOf: '2026-01-01', base: 'AUD', quote: 'PHP', rateE8: 3800000000n, source: 'test'},
    {asOf: localDay(), base: 'AUD', quote: 'PHP', rateE8: 9900000000n, source: 'test'},
  ]);
  await importRows(1);   // one A$1.00 purchase, dated 2026-01-01
  await open();
  // 1.00 at 38 is ₱38.00 — January's rate, not today's ₱99.00.
  await waitFor(() => expect(document.body.textContent).toContain('38.00'));
  expect(document.body.textContent).not.toContain('99.00');
  expect(document.body.textContent).not.toContain('$1.00');
});

/** The list is for finding a transaction. Acting on one belongs to the one you opened. */
it('carries no buttons on its rows, and opens the transaction when one is pressed', async () => {
  await importRows(1);
  await open();
  await waitFor(() => expect(rows()).toHaveLength(1));
  expect(screen.queryByRole('button', {name: 'Edit'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Delete'})).toBeNull();
  expect(screen.queryByText('Split expense categories')).toBeNull();
  fireEvent.click(rows()[0]!);
  await screen.findByText('Supporting statements');
});

/**
 * THE DEVICE'S EXACT ASSERTION. The Android flow opens the row, presses Edit and then types into the
 * "Amount" field — and that field never appeared, four runs running. Delete alone did not cover it,
 * because Edit and Delete fail differently: both are enabled the moment the entry list loads, but Edit
 * has to hand a matching entry to the sheet, and a mismatch there does nothing at all rather than error.
 */
it('opens the entry for editing with its amount already in it', async () => {
  await state.repo!.manual.save({id: 'by-hand', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  await open();
  await waitFor(() => expect(rows()).toHaveLength(1));
  fireEvent.click(rows()[0]!);
  const edit = await screen.findByRole('button', {name: 'Edit'}) as HTMLButtonElement;
  await waitFor(() => expect(edit.disabled).toBe(false));
  fireEvent.click(edit);
  const amount = await screen.findByLabelText('Amount') as HTMLInputElement;
  expect(amount.value).toBe('12.50');
});

it('offers edit and delete on a hand-recorded transaction, and removes it', async () => {
  await state.repo!.manual.save({id: 'by-hand', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  await open();
  await waitFor(() => expect(rows()).toHaveLength(1));
  fireEvent.click(rows()[0]!);
  // Disabled until the entry behind the row has been read, so that a press cannot act on nothing.
  const remove = await screen.findByRole('button', {name: 'Delete'}) as HTMLButtonElement;
  await waitFor(() => expect(remove.disabled).toBe(false));
  fireEvent.click(remove);
  fireEvent.click(await screen.findByRole('button', {name: 'Delete transaction'}));
  await waitFor(async () => expect(await state.repo!.manual.list()).toHaveLength(0));
});

/**
 * An imported row is evidence of what a bank says happened. Editing or deleting it would be rewriting
 * the record rather than correcting it, so those are not offered.
 */
it('offers neither on a row that came from a statement', async () => {
  await importRows(1);
  await open();
  await waitFor(() => expect(rows()).toHaveLength(1));
  fireEvent.click(rows()[0]!);
  await screen.findByText('Supporting statements');
  expect(screen.queryByRole('button', {name: 'Edit'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Delete'})).toBeNull();
});

/** Swap what the app reads back for the entry list, leaving the row in History exactly as it is. */
function withManualList(entries: Awaited<ReturnType<Repository['manual']['list']>>) {
  const real = state.repo!;
  state.repo = {...real, manual: {...real.manual, list: async () => entries}} as Repository;
}

/**
 * "when i click confirm, nothing happens" was about a different button, and it is the same fault.
 * Edit, Match and Delete read the entry behind the open row and, finding none, returned — so all three
 * looked pressable and did nothing at all. Either the thing happens or the screen says why it did not.
 */
it('says so when the entry behind a hand-recorded row cannot be read', async () => {
  await state.repo!.manual.save({id: 'by-hand', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  withManualList([]);
  await open();
  await waitFor(() => expect(rows()).toHaveLength(1));
  fireEvent.click(rows()[0]!);
  const edit = await screen.findByRole('button', {name: 'Edit'}) as HTMLButtonElement;
  await waitFor(() => expect(edit.disabled).toBe(false));
  fireEvent.click(edit);
  await screen.findByText(/could not be read/);
  // The transaction stays open: closing it and showing nothing would be the silent failure again.
  expect(screen.queryByText('Supporting statements')).toBeTruthy();
});

/** Read, but this row's entry is gone — a different situation, so a different sentence. */
it('says so when the entry behind a hand-recorded row has gone', async () => {
  await state.repo!.manual.save({id: 'by-hand', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  const [entry] = await state.repo!.manual.list();
  withManualList([{...entry!, id: 'someone-else'}]);
  await open();
  await waitFor(() => expect(rows()).toHaveLength(1));
  fireEvent.click(rows()[0]!);
  const edit = await screen.findByRole('button', {name: 'Edit'}) as HTMLButtonElement;
  await waitFor(() => expect(edit.disabled).toBe(false));
  fireEvent.click(edit);
  await screen.findByText(/no longer there/);
});

/**
 * THE DEVICE'S ACTUAL FAILURE, which passed on the first hand-recorded transaction every time and
 * failed on the second, four runs running.
 *
 * The entry list was cached under a query that was only enabled while such a row was open. Recording
 * the second transaction invalidated a DISABLED query — React Query marks that stale and does not
 * refetch it — so opening the next row was served the list as it stood when the FIRST row was open.
 * The new id was not in it and Edit did nothing at all.
 *
 * Reproducing it needs the order the device had: open one, which fills the cache; record another, which
 * only invalidates; then open that one. Saving both up front fills the cache with both and the bug
 * cannot appear, which is exactly why every earlier test of mine passed.
 */
it('opens a hand-recorded transaction recorded after the list was last read', async () => {
  await state.repo!.manual.save({id: 'first', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-20', minor: '1250', description: 'Synthetic lunch', category: 'Eating out', notes: ''});
  await open();
  await waitFor(() => expect(rows()).toHaveLength(1));

  // Open the first one, which is what fills the cache this used to read.
  fireEvent.click(rows()[0]!);
  const first = await screen.findByRole('button', {name: 'Edit'}) as HTMLButtonElement;
  await waitFor(() => expect(first.disabled).toBe(false));
  fireEvent.click(first);
  expect(((await screen.findByLabelText('Amount')) as HTMLInputElement).value).toBe('12.50');
  fireEvent.click(screen.getByRole('button', {name: 'Close Edit transaction'}));
  await waitFor(() => expect(screen.queryByLabelText('Amount')).toBeNull());

  // Record another, exactly as the Today screen does: save, then invalidate.
  await state.repo!.manual.save({id: 'second', kind: 'expense', accountId: 'a', destinationId: null,
    date: '2026-01-21', minor: '640', description: 'Synthetic coffee', category: 'Eating out', notes: ''});
  // Reading the list takes real time on a device — SQLCipher across the Capacitor bridge — and that is
  // the whole race: a cached query hands back the OLD list the instant it is re-enabled and refetches
  // behind it, so the button is pressable while what it would read is out of date. In jsdom the refetch
  // lands before anything can press, which is why every version of this test passed until it was slowed
  // down to a device's speed.
  const real = state.repo!;
  state.repo = {...real, manual: {...real.manual,
    list: async () => { await new Promise(resolve => setTimeout(resolve, 50)); return real.manual.list(); }}} as Repository;
  await client.invalidateQueries();
  await waitFor(() => expect(rows()).toHaveLength(2));

  fireEvent.click(rows().find(row => row.textContent?.includes('Synthetic coffee'))!);
  const second = await screen.findByRole('button', {name: 'Edit'}) as HTMLButtonElement;
  await waitFor(() => expect(second.disabled).toBe(false));
  fireEvent.click(second);
  expect(((await screen.findByLabelText('Amount')) as HTMLInputElement).value).toBe('6.40');
});

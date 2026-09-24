// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
import { hash } from '../src/ingest/normalize';
import { ImportWorkspace } from '../src/ui/screens/ImportWorkspace';

/**
 * "when i import something, i dont want to fill up any dates, opening or closing. The app should do
 * that for me. If im going to fill up, only a description what kind of file was that."
 */
const state = vi.hoisted(() => ({ repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown> }));
vi.mock('../src/ui/session', () => ({ useSession: () => ({ state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; } }) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
beforeEach(async () => {
  const { driver } = memoryDriver(); await migrate(driver); state.repo = repository(driver);
  await state.repo.addAccount({ id: 'a', name: 'Synthetic account', type: 'checking', currency: 'AUD', institution: 'Synthetic bank', mask_last4: null, opening_balance_minor: 0n });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
const show = async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={() => undefined}/></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Read file' }));
};

it('imports an export with nothing typed but a description, and shows the file by that description', async () => {
  const csv = 'Date,Description,Amount\n05/01/2026,Synthetic shop,-10.00\n07/01/2026,Synthetic cafe,-4.00';
  await state.repo!.imports.stageFile('synthetic.csv', btoa(csv), hash(csv));
  await show();
  await screen.findByText('Read from the file: 2026-01-05 – 2026-01-07 · no stated balances printed');
  // The dates are there, filled in, folded away: nothing to type.
  expect((screen.getByLabelText('Statement start') as HTMLInputElement).value).toBe('2026-01-05');
  expect((screen.getByLabelText('Statement end') as HTMLInputElement).value).toBe('2026-01-07');
  expect((screen.getByText('Adjust what was read').closest('details') as HTMLDetailsElement).open).toBe(false);
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'January everyday export' } });
  fireEvent.click(screen.getByRole('button', { name: 'Extract for review' }));
  await screen.findByText(/Tier C · Continuity-checked/, {}, { timeout: 10000 });
  expect(await screen.findByText('January everyday export')).toBeTruthy();
  expect((await state.repo!.imports.summaries())[0]!.note).toBe('January everyday export');
  expect((await state.repo!.imports.summaries())[0]!.context.period).toEqual({ start: '2026-01-05', end: '2026-01-07' });
});

it('opens the fields only when the file could not say what it covers', async () => {
  const csv = 'Date,Description,Amount\n05/01,Synthetic shop,-10.00';
  await state.repo!.imports.stageFile('synthetic-undated.csv', btoa(csv), hash(csv));
  await show();
  await screen.findByText('The dates this file covers could not be read. Enter them below.');
  expect((screen.getByText('Adjust what was read').closest('details') as HTMLDetailsElement).open).toBe(true);
  expect((screen.getByLabelText('Statement start') as HTMLInputElement).value).toBe('');
});

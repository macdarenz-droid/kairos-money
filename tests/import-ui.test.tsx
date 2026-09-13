// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository, type Repository } from '../src/core/db/repository';
import { hash } from '../src/ingest/normalize';
import { ImportWorkspace } from '../src/ui/screens/ImportWorkspace';
const state = vi.hoisted(() => ({ repo: undefined as Repository | undefined, tail: Promise.resolve() as Promise<unknown> }));
vi.mock('../src/ui/session', () => ({ useSession: () => ({ state: 'ready', run: <T,>(fn: (repo: Repository) => Promise<T>) => { const next = state.tail.then(() => fn(state.repo!)); state.tail = next.catch(() => undefined); return next; } }) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
beforeEach(async () => { const { driver } = memoryDriver(); await migrate(driver); state.repo = repository(driver); await state.repo.addAccount({ id: 'a', name: 'Synthetic account', type: 'checking', currency: 'AUD', institution: 'Synthetic bank', mask_last4: null, opening_balance_minor: 0n }); HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
afterEach(cleanup);
it.each(['dark', 'light'])('reviews a staged CSV, commits and rolls it back in %s theme', async theme => {
  document.documentElement.dataset.theme = theme;
  const csv = 'Date,Description,Amount\n01/01/2026,Synthetic shop,-10.00'; await state.repo!.imports.stageFile('synthetic.csv', btoa(csv), hash(csv));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={() => undefined}/></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Read file' }));
  for (const [label, value] of [['Statement start', '2026-01-01'], ['Statement end', '2026-01-31'], ['Stated opening balance', '0'], ['Stated closing balance', '-10.00']]) fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Extract for review' }));
  await screen.findByText('✓ Balance check passed', {}, { timeout: 10000 }); expect(await state.repo!.imports.ledger()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
  await screen.findByText('1 transaction'); expect(await state.repo!.imports.ledger()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Roll back' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm rollback' }));
  await waitFor(async () => expect(await state.repo!.imports.ledger()).toHaveLength(0));
  expect(document.documentElement.dataset.theme).toBe(theme);
});

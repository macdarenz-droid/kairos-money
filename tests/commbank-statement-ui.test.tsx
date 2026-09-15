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
vi.mock('../src/ingest/extract', () => ({ extract: async () => {
  const items = [
    { text: 'CommBank Smart Access', x: 460, y: 30, width: 80, page: 1 },
    ...['Date','Transaction','Debit','Credit','Balance'].map((text,i) => ({text,x:[67,115,369,445,503][i]!,y:100,width:[21,115,24,30,39][i]!,page:1})),
    {text:'02 Feb Synthetic supermarket',x:67,y:120,width:135,page:1},
    {text:'10.00',x:368,y:120,width:25,page:1},{text:'90.00 CR',x:500,y:120,width:42,page:1},
  ];
  return {kind:'pdf',text:'CommBank Smart Access Statement Period 1 February 2025 - 28 February 2025 Opening Balance 100.00 CR Closing Balance 90.00 CR',items,table:null,ocr:false,issuer:'commbank'};
} }));

it.each(['dark','light'])('reads statement details without manual date entry and adds confirmed history in %s', async theme => {
  document.documentElement.dataset.theme=theme;
  await state.repo!.imports.stageFile('synthetic-commbank.pdf', btoa('Synthetic fixture'), hash('Synthetic fixture'));
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ImportWorkspace accounts={await state.repo!.accounts()} request={0} consumed={()=>undefined}/></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button',{name:'Read file'}));
  await waitFor(()=>expect((screen.getByLabelText('Statement start') as HTMLInputElement).value).toBe('2025-02-01'));
  expect((screen.getByLabelText('Statement end') as HTMLInputElement).value).toBe('2025-02-28');
  expect((screen.getByLabelText('Stated opening balance') as HTMLInputElement).value).toBe('100.00');
  expect((screen.getByLabelText('Stated closing balance') as HTMLInputElement).value).toBe('90.00');
  fireEvent.click(screen.getByRole('button',{name:'Extract for review'}));
  await screen.findByText('✓ Balance check passed'); expect(await state.repo!.imports.ledger()).toHaveLength(0);
  // Accepting the worked-out categories is the primary choice now; this test takes the other one, and
  // asserts both are offered, because for a long time only the discarding one was.
  expect(screen.getByRole('button',{name:'Use these categories'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Leave them uncategorised'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Confirm import'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Confirm import'}));
  await waitFor(async()=>expect(await state.repo!.imports.ledger()).toHaveLength(1));
  expect((await state.repo!.imports.ledger())[0]!.category).toBeNull();
});

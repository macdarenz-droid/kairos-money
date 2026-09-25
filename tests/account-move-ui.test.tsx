// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {Account} from '../src/core/db/repository';

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const box = vi.hoisted(() => ({ids: ['a', 'b', 'c'], saved: [] as string[][]}));
const row = (id: string) => ({id, name: `Synthetic ${id}`, institution: '', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0, archived_at: null}) as Account;
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready', run: (fn: (repo: unknown) => Promise<unknown>) => fn({
  accounts: async () => box.ids.map(row), notices: {defaultAccount: async () => null},
  orderAccounts: async (ids: string[]) => { box.saved.push(ids); box.ids = ids; }})})}));
const {AccountSheet} = await import('../src/ui/screens/AccountSheet');
afterEach(cleanup);

const open = (id: string) => render(<QueryClientProvider client={new QueryClient()}><AccountSheet account={row(id)} onClose={() => undefined} onSaved={() => undefined}/></QueryClientProvider>);
const button = (name: string) => screen.getByRole('button', {name}) as HTMLButtonElement;

it('moves an account up or down from its sheet, without dragging', async () => {
  open('b');
  await waitFor(() => expect(button('Move up').disabled).toBe(false));
  fireEvent.click(button('Move up'));
  await waitFor(() => expect(box.saved).toEqual([['b', 'a', 'c']]));
  await waitFor(() => expect(button('Move up').disabled).toBe(true));
  fireEvent.click(button('Move down'));
  await waitFor(() => expect(box.saved.at(-1)).toEqual(['a', 'b', 'c']));
});

it('cannot move the last account further down', async () => {
  box.ids = ['a', 'b', 'c']; open('c');
  await waitFor(() => expect(button('Move up').disabled).toBe(false));
  expect(button('Move down').disabled).toBe(true);
});

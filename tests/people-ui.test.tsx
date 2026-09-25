// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'ready',
  run: (fn: (repo: Record<string, unknown>) => Promise<unknown>) => fn({people: {list: async () => []}, rates: async () => []})})}));
vi.mock('../src/ui/currency', () => ({useDisplayCurrency: () => 'AUD'}));
const {People} = await import('../src/ui/screens/People');

afterEach(cleanup);
const words = (text: string) => text.trim().split(/\s+/).length;

it('says what money between people is for, where it goes, and that it moves nothing', () => {
  render(<QueryClientProvider client={new QueryClient()}><People/></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', {name: 'Record money lent or borrowed'}));
  const purpose = screen.getByText(/lent or borrowed, and who still owes whom/);
  expect(words(purpose.textContent!)).toBeLessThanOrEqual(12);
  fireEvent.click(screen.getByRole('button', {name: 'What Money between people means'}));
  const explain = document.querySelector('.explain-inline')!.textContent!;
  expect(explain.match(/[.!?](\s|$)/g)).toHaveLength(2);
  expect(explain).toMatch(/Between people/);
  expect(explain).toMatch(/Settle up/);
  expect(explain).toMatch(/never moves real money/);
  const options = [...screen.getByLabelText('Which way').querySelectorAll('option')].map(o => o.textContent);
  expect(options).toEqual(['I lent money: they owe me', 'I borrowed money: I owe them']);
});

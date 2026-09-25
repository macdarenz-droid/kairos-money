// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';

vi.mock('../src/ui/session', () => ({useSession: () => ({state: 'locked', biometric: false, biometricEnabled: false, recoveryCode: ''})}));
vi.mock('../src/core/crypto/native', () => ({Vault: {}}));
const {LockScreen} = await import('../src/ui/screens/Lock');
afterEach(cleanup);

it('draws the logo, lands the dot, then raises the form, once', () => {
  render(<LockScreen/>);
  const mark = document.querySelector('.lock-arrival')!;
  expect(mark.querySelector('.arrival-ring')).toBeTruthy();
  expect(mark.querySelector('.arrival-dot')).toBeTruthy();
  expect(mark.getAttribute('aria-hidden')).toBe('true');
  // The form waits for the mark, and nothing here loops.
  expect(screen.getByLabelText('PIN').closest('.lock-rise')).toBeTruthy();
  expect(screen.getByText('Welcome back').closest('.lock-rise')).toBeTruthy();
});

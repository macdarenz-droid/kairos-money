// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ImportProgress } from '../src/ui/design/ImportProgress';
afterEach(cleanup);
it.each(['dark','light'])('announces actual import stage without fake percentage in %s',theme=>{
 document.documentElement.dataset.theme=theme;const {rerender}=render(<ImportProgress message="Reading page 2 of 16"/>);
 expect(screen.getByRole('status').textContent).toContain('Reading page 2 of 16');
 expect(screen.queryByRole('progressbar')).toBeNull();
 rerender(<ImportProgress message="Preparing transactions for review…"/>);
 expect(screen.getByRole('status').textContent).toContain('Preparing transactions');
});

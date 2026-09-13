import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), { name: 'development-csp', apply: 'serve', transformIndexHtml(html) { return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, ''); } }],
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node', testTimeout: 30000 },
});

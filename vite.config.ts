import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), { name: 'development-csp', apply: 'serve', transformIndexHtml(html) { return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, ''); } }],
  // The short commit, baked in at build time. Every gate prints "0.2.0", so a screenshot could not say
  // which build it came from and several rounds went on working that out. GitHub Actions sets
  // GITHUB_SHA for every step; a local build says so instead of pretending.
  define: { __KAIROS_BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7) || 'local') },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node', testTimeout: 30000 },
});

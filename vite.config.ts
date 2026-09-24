import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), { name: 'development-csp', apply: 'serve', transformIndexHtml(html) { return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, ''); } }],
  // Version from package.json and the short commit, so a screenshot names its build. CI sets GITHUB_SHA.
  define: { __KAIROS_VERSION__: JSON.stringify(process.env.npm_package_version ?? JSON.parse(readFileSync('package.json', 'utf8')).version),
    __KAIROS_BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7) || 'local') },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node', testTimeout: 30000 },
});

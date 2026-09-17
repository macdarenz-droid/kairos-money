/**
 * Run the full check and end with a verdict that cannot be misread.
 *
 * `npm run check` already exits non-zero when something fails. That was never the problem. The problem
 * is that its output is long, so it gets piped through a filter — and a failing BUILD does not print an
 * error line the filter is looking for, it simply omits the success line. The signal becomes an ABSENCE,
 * and an absence is easy to miss in a wall of passing tests. I pushed a commit with four TypeScript
 * errors that way: tests passed, "✓ built" quietly did not appear, and I read the greens.
 *
 * So the last line here is always present and always says one of two words. Any filter, however lazy,
 * catches it.
 *
 *   node scripts/verify.mjs
 */
import { spawnSync } from 'node:child_process';

const steps = ['lint', 'device:strings', 'test', 'build', 'schema', 'release:config'];
const failed = [];
for (const step of steps) {
  const run = spawnSync('npm', ['run', step], { stdio: 'inherit' });
  if (run.status !== 0) { failed.push(step); break; }   // Stop at the first failure, as `check` does.
}

console.log('');
if (failed.length) {
  console.log(`VERDICT: FAILED — ${failed.join(', ')}`);
  process.exit(1);
}
console.log('VERDICT: GREEN — lint, device strings, tests, build, schema and release config all pass.');

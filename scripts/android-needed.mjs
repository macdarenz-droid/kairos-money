/**
 * Whether a push needs the Android gate: only when something besides docs changed.
 *   node scripts/android-needed.mjs <before-sha> <after-sha>   → prints "code=true" or "code=false"
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DOCS = [/^ADR\//, /^docs\/(?!evidence\/|SCHEMA\.md$|CONTRAST\.md$)/, /^[^/]+\.md$/];

/** True unless every path is a doc; an empty or unknown list is treated as code. */
export function needsAndroid(paths) {
  return !paths.length || paths.some(path => !DOCS.some(rule => rule.test(path)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [before = '', after = 'HEAD'] = process.argv.slice(2);
  let paths = [];
  // A new branch, a manual run or a force-push has no usable "before", so it runs everything.
  if (/^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before)) {
    try { paths = execFileSync('git', ['diff', '--name-only', before, after], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch { paths = []; }
  }
  console.log(`code=${needsAndroid(paths)}`);
}

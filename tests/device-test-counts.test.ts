import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';

/**
 * THE COUNT IS THE CONTRACT, AND IT WAS DECLARED IN THREE PLACES THAT COULD DISAGREE.
 *
 * scripts/run-native-gate.py demands a number of tests from each instrumented class — that is what
 * catches a device test which quietly stops running instead of quietly passing. scripts/test-native-gate.py
 * simulates the same classes to test the runner itself. And the Java files are what actually run.
 *
 * Deleting one device test made all three disagree, and nothing local said so: the Android gate failed
 * twenty minutes after a push with "OK (1 test)" beside "did not pass", and the runner's own tests failed
 * in a separate job for the same reason. Both are now a spelling mistake away from being caught here, in
 * the suite that runs before anything is pushed.
 */
const RUNNER = readFileSync('scripts/run-native-gate.py', 'utf8');
const SIMULATOR = readFileSync('scripts/test-native-gate.py', 'utf8');

const declared = [...RUNNER.matchAll(/instrumentation\('(\w+)',\s*(\d+)\)/g)]
  .map(([, name, count]) => [name!, Number(count)] as const);

it('demands from every instrumented class exactly the tests it holds', () => {
  expect(declared.length).toBeGreaterThan(10);
  for (const [name, count] of declared) {
    const source = readFileSync(`android/app/src/androidTest/java/app/kairos/money/${name}.java`, 'utf8');
    expect(source.match(/@Test\b/g)?.length ?? 0, `${name} declares ${count} in run-native-gate.py`).toBe(count);
  }
});

it('simulates the same counts it demands, so the runner is tested against what it runs', () => {
  for (const [name, count] of declared) {
    const simulated = new RegExp(`'${name}':\\s*(\\d+)`).exec(SIMULATOR)?.[1];
    expect(Number(simulated), `${name} in scripts/test-native-gate.py`).toBe(count);
  }
});

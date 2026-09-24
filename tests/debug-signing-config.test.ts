import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';

/**
 * THE KEYSTORE THAT IS CACHED MUST BE THE KEYSTORE THAT SIGNS.
 *
 * Gradle picks the debug keystore's path itself unless it is told, and it was not picking the cached
 * one: a build whose cache RESTORED the file still produced a different signing certificate from the
 * build that created it. A signing identity that moves between builds is exactly why Android refuses to
 * install an update over the copy already on a phone — the only way past it is an uninstall, which takes
 * the encrypted ledger with it.
 *
 * The fix is one environment variable read in two places, in two languages, with nothing else connecting
 * them. That is the same shape as the export's table count living in Java and in TypeScript, which went
 * wrong the moment a table was added. So it is checked here rather than remembered.
 */
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const workflow = readFileSync('.github/workflows/android.yml', 'utf8');
const VARIABLE = 'KAIROS_DEBUG_STORE_FILE';
const CACHED_PATH = '~/.android/debug.keystore';

describe('the development signing identity', () => {
  it('is read from the environment by the build, not guessed', () => {
    expect(gradle).toContain(`System.getenv('${VARIABLE}')`);
    expect(gradle).toMatch(/signingConfigs\s*\{[\s\S]*debug\s*\{[\s\S]*storeFile file\(debugStorePath\)/);
  });

  it('is set by the workflow to the very path the workflow caches', () => {
    expect(workflow).toContain(`${VARIABLE}=$HOME/.android/debug.keystore`);
    expect(workflow).toContain(`path: ${CACHED_PATH}`);
  });

  /** An ordinary local build has no such variable and must be left exactly as it was. */
  it('leaves a build with no such variable on the plugin’s own default', () => {
    expect(gradle).toContain('debugStorePath != null');
    expect(gradle).toContain('file(debugStorePath).exists()');
    expect(gradle).toContain('if (debugStoreConfigured)');
  });

  /**
   * Both numbers, at the end, where a log can actually be read. One alone could not say whether the
   * keystore was wrong or was simply not the one being used.
   */
  it('prints the keystore’s fingerprint beside the APK’s', () => {
    const tail = workflow.slice(workflow.indexOf('repeated at the end of the log'));
    expect(tail).toContain('Keystore certificate SHA-256');
    expect(tail).toContain('verify-signing-identity.py');
  });

  /** No key material, and no password that is not the published Android debug one, in this repository. */
  it('keeps the debug password to the published value and ships no key', () => {
    expect(gradle).toContain("storePassword 'android'");
    expect(gradle).not.toMatch(/-----BEGIN|\.keystore['"]\s*\)\s*\/\/\s*committed/);
  });
});

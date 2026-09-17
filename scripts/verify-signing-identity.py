#!/usr/bin/env python3
"""Fail the build when the APK's signing identity changes, instead of letting a phone discover it.

Android refuses to install an update signed by a different key than the copy already on the device. The
only way past it is to uninstall — which deletes the encrypted ledger. So a rotated signing key does not
show up as a build problem; it shows up as somebody losing their data at the worst possible moment.

The development key lives in a GitHub Actions cache, and caches are evicted after a week unused. That
makes rotation a matter of how long the project sat idle, which is not something anyone will remember to
check. Pinning the certificate's fingerprint turns a silent, user-facing failure into a loud one here.

A certificate fingerprint is public by design — it is what every device compares to decide whether an
update is genuine — so unlike the key itself it belongs in the repository.

Run with the APK path; the expected value lives beside this script's output file.
"""
import pathlib
import re
import subprocess
import sys

PINNED = pathlib.Path('android/debug-signing-fingerprint.txt')


def fingerprint(apk: str) -> str:
    sdk = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/usr/local/lib/android/sdk')
    apksigner = next(sdk.glob('build-tools/*/apksigner'), None)
    if apksigner is None:
        sys.exit('apksigner was not found; cannot check the signing identity.')
    printed = subprocess.run([str(apksigner), 'verify', '--print-certs', apk],
                             capture_output=True, text=True, check=True).stdout
    found = re.search(r'SHA-256 digest:\s*([0-9a-fA-F]{64})', printed)
    if not found:
        sys.exit('apksigner did not report a SHA-256 certificate digest.')
    return found.group(1).lower()


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit('Usage: verify-signing-identity.py <apk> [sdk-root]')
    actual = fingerprint(sys.argv[1])
    print(f'Debug signing certificate SHA-256: {actual}')

    if not PINNED.exists() or not PINNED.read_text().strip():
        # Bootstrap: there is nothing to compare against yet. Print it so it can be pinned, and say so
        # rather than passing silently — an unpinned check protects nobody.
        print(f'NOT PINNED. Write this value into {PINNED} to make a future rotation fail the build.')
        return

    expected = PINNED.read_text().strip().lower()
    if actual != expected:
        sys.exit(
            f'The development signing key has CHANGED.\n'
            f'  expected {expected}\n'
            f'  actual   {actual}\n'
            'Every phone with the previous build installed will refuse this one, and the only way past\n'
            'it is an uninstall that deletes the ledger. Restore the original keystore (the Actions\n'
            'cache holding it has most likely expired) before publishing this APK.')
    print('Signing identity unchanged; this build installs over the previous one.')


if __name__ == '__main__':
    main()

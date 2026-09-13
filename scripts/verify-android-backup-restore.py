"""Prove backup -> locked reset -> wrong-code refusal -> exact restore on Android."""
from pathlib import Path
import json
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/evidence'
RUNNER = 'app.kairos.money.test/app.kairos.money.KairosTestRunner'
EXTERNAL = [
    '/sdcard/Download/Kairos-money-backup.kairos',
    '/sdcard/Download/kairos-test-recovery.txt',
    '/sdcard/Download/kairos-test-ledger-digest.txt',
]


def adb(*args, timeout=360):
    return subprocess.run(['adb', *args], text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, timeout=timeout)


def instrument(name, count=1):
    result = adb('shell', 'am', 'instrument', '-w', '-e', 'class',
                 'app.kairos.money.' + name, RUNNER)
    (EVIDENCE / (name + '.log')).write_text(result.stdout)
    if result.returncode or not re.search(r'OK \(' + str(count) + r' tests?\)', result.stdout):
        raise AssertionError(name + ' did not pass; see its instrumentation log')


def owned_files():
    internal = adb('shell', 'run-as', 'app.kairos.money', 'find', '.', '-type', 'f')
    assert internal.returncode == 0, 'Could not inspect Kairos private storage: ' + internal.stdout
    external = adb('shell', 'if [ -d /sdcard/Android/data/app.kairos.money ]; then find /sdcard/Android/data/app.kairos.money -type f; fi')
    assert external.returncode == 0, 'Could not inspect Kairos external storage: ' + external.stdout
    return [line.strip() for line in (internal.stdout + '\n' + external.stdout).splitlines() if line.strip()]


adb('shell', 'rm', '-f', *EXTERNAL)
instrument('ForgotPinInstrumentedTest')
instrument('BackupBeforeResetInstrumentedTest')
before = owned_files()
assert any('kairos-moneySQLite.db' in path for path in before), 'Populated database missing before reset'
for path in EXTERNAL:
    assert adb('shell', 'test', '-s', path).returncode == 0, 'Backup acceptance file missing: ' + path

reset = adb('shell', 'am', 'instrument', '-w', '-e', 'class',
            'app.kairos.money.ResetForRestoreInstrumentedTest', RUNNER)
(EVIDENCE / 'ResetForRestoreInstrumentedTest.log').write_text(reset.stdout)
after_reset = before
for _ in range(30):
    after_reset = owned_files()
    if not after_reset:
        break
    time.sleep(1)
assert not after_reset, 'App-owned files remain after reset: ' + repr(after_reset)
for path in EXTERNAL:
    assert adb('shell', 'test', '-s', path).returncode == 0, 'User backup did not survive app reset: ' + path

instrument('BackupAfterResetInstrumentedTest')
restored = owned_files()
assert any('kairos-moneySQLite.db' in path for path in restored), 'Restored database missing'
for path in EXTERNAL:
    assert adb('shell', 'test', '-e', path).returncode != 0, 'Synthetic acceptance file was not cleaned: ' + path

report = {
    'status': 'PASS',
    'forgot_pin': 'Android device authentication -> mandatory replacement -> old PIN refused -> ledger digest retained -> original test PIN restored',
    'backup': 'Encrypted file saved through Android document picker',
    'reset': 'Locked Forgot PIN -> typed DELETE KAIROS -> Android clearApplicationUserData',
    'files_before_reset': len(before),
    'app_owned_files_after_reset': 0,
    'external_backup_survived_reset': True,
    'wrong_code': 'Refused with zero user ledger rows',
    'restore': 'Android picker; every typed table/column/row matched the pre-backup SHA-256 digest',
    'synthetic_external_files_cleaned': True,
}
(EVIDENCE / 'android-backup-reset-restore.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))

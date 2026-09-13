"""Run only on a fresh Android 34 test emulator; fixtures contain synthetic data."""
from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/evidence'
EVIDENCE.mkdir(parents=True, exist_ok=True)


def adb(*args, timeout=120):
    result = subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


def instrumentation(name, count):
    log = adb('shell', 'am', 'instrument', '-w', '-e', 'class',
              'app.kairos.money.' + name,
              'app.kairos.money.test/androidx.test.runner.AndroidJUnitRunner', timeout=360)
    (EVIDENCE / (name + '.log')).write_text(log)
    print(log, flush=True)
    if not re.search(r'OK \(' + str(count) + r' tests?\)', log):
        raise RuntimeError(name + ' did not pass; see its instrumentation log')


log_stream = None
log_file = None
try:
    for name in ['android/app/build/outputs/apk/debug/app-debug.apk',
                 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']:
        result = adb('install', '-r', str(ROOT / name))
        if 'Success' not in result:
            raise RuntimeError('APK installation failed: ' + result)
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    (EVIDENCE / 'android-webview-provider.txt').write_text(adb('shell', 'dumpsys', 'webviewupdate'))
    adb('logcat', '-c')
    log_file = (EVIDENCE / 'android-logcat-full.log').open('w')
    log_stream = subprocess.Popen(['adb', 'logcat', '-b', 'all', '-v', 'threadtime'], stdout=log_file, stderr=subprocess.STDOUT)
    instrumentation('FoundationInstrumentedTest', 2)
    instrumentation('AcceptanceInstrumentedTest', 1)
    adb('pull', '/sdcard/Android/data/app.kairos.money/files/evidence', str(EVIDENCE / 'android-screens'))
    subprocess.run([sys.executable, str(ROOT / 'scripts/verify-android-delete.py')], check=True)
    instrumentation('PostDeleteInstrumentedTest', 1)
    (EVIDENCE / 'native-run-status.json').write_text(json.dumps({
        'status': 'PASS', 'installed': True, 'instrumentation_executed': True,
        'foundation_tests': 2, 'acceptance_tests': 1, 'post_delete_tests': 1,
        'native_encryption_proven': True, 'native_delete_proven': True,
        'real_document_export_proven': True, 'background_unlock': '1 second retained; 61 seconds locked',
        'runner': 'Android 34 emulator; airplane mode enabled',
        'screenshots_require_review': True,
    }, indent=2) + '\n')
except Exception as error:
    (EVIDENCE / 'native-run-status.json').write_text(json.dumps({
        'status': 'FAIL', 'reason': str(error),
        'runner': 'Android 34 emulator',
        'evidence': 'Read the individual instrumentation logs for completed assertions; the full native gate did not pass.',
    }, indent=2) + '\n')
    raise
finally:
    # Preserve failure evidence even if an assertion interrupts the happy path.
    subprocess.run(['adb', 'pull', '/sdcard/Android/data/app.kairos.money/files/evidence',
                    str(EVIDENCE / 'android-screens')], capture_output=True)
    if log_stream is not None:
        log_stream.terminate()
        try:
            log_stream.wait(timeout=10)
        except subprocess.TimeoutExpired:
            log_stream.kill()
            log_stream.wait(timeout=10)
    if log_file is not None:
        log_file.close()
    for label, command in [
        ('android-logcat', ['logcat', '-b', 'crash', '-d']),
        ('android-exit-info', ['shell', 'dumpsys', 'activity', 'exit-info', 'app.kairos.money']),
    ]:
        result = subprocess.run(['adb', *command], capture_output=True, text=True, timeout=30)
        content = result.stdout + result.stderr
        (EVIDENCE / (label + '.log')).write_text(content)
        print(label + ':\n' + content, flush=True)

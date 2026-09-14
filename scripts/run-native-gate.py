"""Run only on a fresh Android 34 test emulator; fixtures contain synthetic data."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/evidence'
EVIDENCE.mkdir(parents=True, exist_ok=True)
SCREENS = EVIDENCE / 'android-screens-current'
# Generated output from this disposable test run; never reuse historical screenshots.
if SCREENS.exists():
    shutil.rmtree(SCREENS)


def adb(*args, timeout=120):
    result = subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


def instrumentation(name, count):
    log = adb('shell', 'am', 'instrument', '-w', '-e', 'class',
              'app.kairos.money.' + name,
              'app.kairos.money.test/app.kairos.money.KairosTestRunner', timeout=360)
    (EVIDENCE / (name + '.log')).write_text(log)
    print(log, flush=True)
    if not re.search(r'OK \(' + str(count) + r' tests?\)', log):
        raise RuntimeError(name + ' did not pass; see its instrumentation log')


log_stream = None
log_file = None
try:
    adb('logcat', '-c')
    log_file = (EVIDENCE / 'android-logcat-full.log').open('w')
    log_stream = subprocess.Popen(['adb', 'logcat', '-b', 'all', '-v', 'threadtime'], stdout=log_file, stderr=subprocess.STDOUT)
    # First-boot HOME input can stall Launcher before BOOT_COMPLETED receivers finish.
    # Prepare only the disposable test device, before installing or launching Kairos.
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    boot_idle = adb('shell', 'am', 'wait-for-broadcast-idle', timeout=120)
    if 'All broadcast queues are idle' not in boot_idle:
        raise RuntimeError('Android boot broadcasts did not become idle: ' + boot_idle)
    adb('shell', 'am', 'force-stop', 'com.android.launcher3')
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME')
    adb('shell', 'am', 'wait-for-broadcast-idle', timeout=120)
    readiness_deadline = time.monotonic() + 60
    readiness_attempts = []
    hierarchy = ''
    while time.monotonic() < readiness_deadline:
        dump = subprocess.run(['adb', 'shell', 'uiautomator', 'dump', '--compressed',
                               '/sdcard/kairos-device-ready.xml'], capture_output=True, text=True, timeout=30)
        readiness_attempts.append({'returncode': dump.returncode, 'stdout': dump.stdout, 'stderr': dump.stderr})
        (EVIDENCE / 'android-device-ready-attempts.json').write_text(json.dumps(readiness_attempts, indent=2) + '\n')
        # uiautomator can exit zero without writing a file while its accessibility tree is busy.
        if dump.returncode == 0 and 'dumped to:' in dump.stdout:
            hierarchy = adb('shell', 'cat', '/sdcard/kairos-device-ready.xml')
            break
        time.sleep(1)
    if not hierarchy:
        raise RuntimeError('Android did not produce a ready UI hierarchy within 60 seconds; see android-device-ready-attempts.json')
    adb('shell', 'rm', '/sdcard/kairos-device-ready.xml')
    (EVIDENCE / 'android-device-ready.xml').write_text(hierarchy)
    if 'com.android.launcher3' not in hierarchy or 'android:id/aerr_' in hierarchy:
        raise RuntimeError('Android launcher is not ready or a system error dialog is visible; see android-device-ready.xml')
    (EVIDENCE / 'android-device-ready.json').write_text(json.dumps({
        'status': 'PASS', 'boot_broadcasts_idle': True,
        'launcher_restarted_before_app_install': 'com.android.launcher3',
        'launcher_visible_without_error_dialog': True,
    }, indent=2) + '\n')
    adb('shell', 'locksettings', 'set-pin', '739182')
    for name in ['android/app/build/outputs/apk/debug/app-debug.apk',
                 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']:
        result = adb('install', '-r', str(ROOT / name))
        if 'Success' not in result:
            raise RuntimeError('APK installation failed: ' + result)
    adb('shell', 'appwidget', 'grantbind', '--package', 'app.kairos.money')
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    adb('shell', 'am', 'force-stop', 'app.kairos.money')
    cold_launch = adb('shell', 'am', 'start', '-W', '-n', 'app.kairos.money/.MainActivity', timeout=30)
    cold_match = re.search(r'TotalTime:\s*(\d+)', cold_launch)
    if cold_match is None:
        raise RuntimeError('Android did not report a cold-start TotalTime: ' + cold_launch)
    cold_ms = int(cold_match.group(1))
    (EVIDENCE / 'android-cold-start.json').write_text(json.dumps({'status': 'PASS' if cold_ms < 2000 else 'FAIL', 'total_time_ms': cold_ms, 'limit_ms': 2000, 'measurement': cold_launch}, indent=2) + '\n')
    if cold_ms >= 2000:
        raise RuntimeError('Cold start exceeded 2000 ms: ' + str(cold_ms) + ' ms')
    adb('shell', 'am', 'force-stop', 'app.kairos.money')
    (EVIDENCE / 'android-webview-provider.txt').write_text(adb('shell', 'dumpsys', 'webviewupdate'))
    instrumentation('PinRecoveryInstrumentedTest', 3)
    instrumentation('FoundationInstrumentedTest', 2)
    instrumentation('KeyProtectionInstrumentedTest', 1)
    instrumentation('HardeningInstrumentedTest', 1)
    instrumentation('ImportInstrumentedTest', 2)
    instrumentation('LargeImportInstrumentedTest', 1)
    instrumentation('RevisionInstrumentedTest', 2)
    instrumentation('IntelligenceInstrumentedTest', 4)
    instrumentation('AccessibilityInstrumentedTest', 1)
    instrumentation('AcceptanceInstrumentedTest', 1)
    adb('pull', '/sdcard/Android/data/app.kairos.money/files/evidence', str(SCREENS))
    subprocess.run(['node', '--import', 'tsx', str(ROOT / 'scripts/verify-native-ocr.ts'), str(SCREENS)], cwd=ROOT, check=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/verify-android-backup-restore.py')], check=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/verify-android-delete.py')], check=True)
    instrumentation('PostDeleteInstrumentedTest', 1)
    (EVIDENCE / 'native-run-status.json').write_text(json.dumps({
        'status': 'PASS', 'installed': True, 'instrumentation_executed': True,
        'authentication_bound_key_tests': 1, 'pin_recovery_tests': 3, 'foundation_tests': 2, 'hardening_tests': 1, 'import_tests': 2, 'large_import_tests': 1, 'revision_tests': 2, 'intelligence_tests': 4, 'manual_entry_tests': 1, 'monthly_visual_tests': 1, 'spending_pattern_tests': 1, 'acceptance_tests': 1,
        'forgot_pin_device_tests': 1, 'backup_before_reset_tests': 1, 'backup_after_reset_tests': 1, 'post_delete_tests': 1,
        'native_encryption_proven': True, 'native_delete_proven': True, 'cold_start_under_2_seconds': True, 'text_zoom_200_percent_tests': 1,
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
    if not SCREENS.exists():
        subprocess.run(['adb', 'pull', '/sdcard/Android/data/app.kairos.money/files/evidence',
                        str(SCREENS)], capture_output=True)
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

"""Host-only runner regressions. Every subprocess is mocked; no device is touched."""
import contextlib
import io
import itertools
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SCRIPTS = Path(__file__).resolve().parent
COUNTS = {
    'PinRecoveryInstrumentedTest': 3, 'FoundationInstrumentedTest': 2,
    'KeyProtectionInstrumentedTest': 1, 'HardeningInstrumentedTest': 1,
    'ImportInstrumentedTest': 2, 'LargeImportInstrumentedTest': 1,
    'NotificationsInstrumentedTest': 1,
    'RevisionInstrumentedTest': 1, 'IntelligenceInstrumentedTest': 4,
    'LedgerPerformanceInstrumentedTest': 1,
    'NoticeCaptureInstrumentedTest': 6,
    'QuickAddInstrumentedTest': 3,
    'AccessibilityInstrumentedTest': 1, 'UsabilityBaselineInstrumentedTest': 1, 'AcceptanceInstrumentedTest': 1,
    'PostDeleteInstrumentedTest': 1,
}


class NativeGateTest(unittest.TestCase):
    def run_gate(self, times=(1600, 1700, 1800), launch_state='COLD', fail_class=None, missing_time=False, emulator=True, existing_install=False,
                 failed_startup_dumps=0, unready_sample=None, malformed_sample=None):
        calls = []
        samples = iter(times)
        sample_number = 0
        remaining_dump_failures = failed_startup_dumps

        def command(args, **_kwargs):
            nonlocal sample_number, remaining_dump_failures
            calls.append(args)
            output = ''
            if args[0] != 'adb':
                return subprocess.CompletedProcess(args, 0, '', '')
            if args[1] in ('install', 'uninstall'):
                output = 'Success\n'
            elif args[1:4] == ['shell', 'getprop', 'ro.kernel.qemu']:
                output = '1\n' if emulator else ''
            elif args[1:5] == ['shell', 'pm', 'list', 'packages']:
                output = 'package:app.kairos.money\n' if existing_install else ''
            elif args[1:4] == ['shell', 'am', 'wait-for-broadcast-idle']:
                output = 'All broadcast queues are idle!'
            elif args[1:4] == ['shell', 'uiautomator', 'dump']:
                output = 'UI hierarchy dumped to: ' + args[-1]
                if args[-1].endswith('kairos-startup-ready.xml') and remaining_dump_failures:
                    remaining_dump_failures -= 1
                    return subprocess.CompletedProcess(args, 1, output, 'UiAutomation: Bad file descriptor')
            elif args[1:3] == ['shell', 'cat']:
                output = ('<node package="app.kairos.money" text="Create private ledger"/>'
                          if args[-1].endswith('kairos-startup-ready.xml') else '<node package="com.android.launcher3"/>')
                if args[-1].endswith('kairos-startup-ready.xml'):
                    if sample_number == unready_sample:
                        output = '<node package="app.kairos.money" text="Loading"/>'
                    if sample_number == malformed_sample:
                        output = '<node package="app.kairos.money" text="Create private ledger"'
            elif args[1:4] == ['shell', 'am', 'start'] and '-n' in args:
                sample_number += 1
                timing = '' if missing_time else 'TotalTime: ' + str(next(samples)) + '\n'
                output = 'Status: ok\nLaunchState: ' + launch_state + '\n' + timing + 'Complete\n'
            elif args[1:4] == ['shell', 'am', 'instrument']:
                name = args[-2].split('.')[-1]
                output = 'FAILURES!!!' if name == fail_class else 'OK (' + str(COUNTS[name]) + ' tests)'
            return subprocess.CompletedProcess(args, 0, output, '')

        with tempfile.TemporaryDirectory(prefix='kairos-gate-host-test-') as temp:
            root = Path(temp)
            scripts = root / 'scripts'
            scripts.mkdir()
            runner = scripts / 'run-native-gate.py'
            shutil.copyfile(SCRIPTS / 'run-native-gate.py', runner)
            error = None
            with patch('subprocess.run', side_effect=command), patch('subprocess.Popen', return_value=MagicMock()), \
                 patch('time.monotonic', side_effect=itertools.count()), patch('time.sleep'), contextlib.redirect_stdout(io.StringIO()):
                try:
                    runpy.run_path(str(runner), run_name='__main__')
                except RuntimeError as caught:
                    error = str(caught)
            evidence = root / 'docs/evidence'
            return {
                'error': error, 'calls': calls,
                'status': json.loads((evidence / 'native-run-status.json').read_text()),
                'startup': json.loads((evidence / 'android-cold-start.json').read_text()) if (evidence / 'android-cold-start.json').exists() else None,
                'readiness': {p.name: json.loads(p.read_text()) for p in evidence.glob('android-startup-ready-*-attempts.json')},
            }

    def test_refuses_physical_devices_and_existing_installations(self):
        for settings in ({'emulator': False}, {'existing_install': True}):
            with self.subTest(settings=settings):
                result = self.run_gate(**settings)
                self.assertIsNotNone(result['error'])
                self.assertFalse(any(args[1] in ('install', 'uninstall') for args in result['calls']))
                self.assertFalse(any('locksettings' in args for args in result['calls']))

    def test_success_requires_every_journey_and_valid_benchmark(self):
        result = self.run_gate()
        self.assertIsNone(result['error'])
        self.assertEqual(result['status']['status'], 'PASS')
        self.assertEqual(result['status']['completed_instrumentation'], list(COUNTS))
        self.assertEqual(result['startup']['process_cold_median_ms'], 1700)
        self.assertEqual(result['startup']['variant'], 'benchmark')
        self.assertFalse(result['startup']['debuggable'])
        calls = result['calls']
        installs = [i for i, args in enumerate(calls) if args[:2] == ['adb', 'install']]
        removal = calls.index(['adb', 'uninstall', 'app.kairos.money'])
        self.assertIn('app-benchmark.apk', calls[installs[0]][-1])
        self.assertLess(installs[0], removal)
        self.assertLess(removal, installs[1])
        self.assertIn('app-debug.apk', calls[installs[1]][-1])
        self.assertEqual(sum(args[:4] == ['adb', 'shell', 'cat', '/sdcard/kairos-startup-ready.xml'] for args in calls), 3)

    def test_slow_median_runs_full_journey_but_gate_still_fails(self):
        result = self.run_gate(times=(2339, 2558, 2506))
        self.assertIn('2506 ms', result['error'])
        self.assertEqual(result['status']['status'], 'FAIL')
        self.assertTrue(result['status']['functional_complete'])
        self.assertEqual(result['status']['completed_instrumentation'], list(COUNTS))
        self.assertEqual(result['startup']['status'], 'FAIL')

    def test_first_install_ceiling_is_independent_of_median(self):
        result = self.run_gate(times=(2500, 1500, 1600))
        self.assertIn('Fresh-install', result['error'])
        self.assertTrue(result['status']['functional_complete'])
        self.assertEqual(result['startup']['process_cold_median_ms'], 1600)

    def test_exact_median_limit_is_not_accepted(self):
        result = self.run_gate(times=(1900, 2000, 2100))
        self.assertIn('2000 ms', result['error'])
        self.assertEqual(result['status']['status'], 'FAIL')

    def test_warm_launch_cannot_supply_cold_start_evidence(self):
        result = self.run_gate(launch_state='WARM')
        self.assertIn('process-cold launch', result['error'])
        self.assertTrue(result['status']['functional_complete'])
        self.assertEqual(result['startup']['samples'], [])

    def test_missing_time_fails_without_blocking_functional_evidence(self):
        result = self.run_gate(missing_time=True)
        self.assertIn('TotalTime', result['error'])
        self.assertTrue(result['status']['functional_complete'])

    def test_functional_failure_retains_previous_startup_failure(self):
        result = self.run_gate(times=(2339, 2558, 2506), fail_class='ImportInstrumentedTest')
        self.assertIn('ImportInstrumentedTest', result['error'])
        self.assertFalse(result['status']['functional_complete'])
        self.assertIn('2506 ms', result['status']['performance_failures'][0])
        self.assertEqual(result['status']['completed_instrumentation'], list(COUNTS)[:4])

    def test_transient_dumper_failure_retries_readiness_without_resampling(self):
        result = self.run_gate(failed_startup_dumps=1)
        self.assertIsNone(result['error'])
        self.assertEqual(len(result['startup']['samples']), 3)
        attempts = result['readiness']['android-startup-ready-1-attempts.json']
        self.assertEqual([a['ready'] for a in attempts], [False, True])
        self.assertEqual(attempts[0]['returncode'], 1)
        calls = result['calls']
        for i, args in enumerate(calls):
            if args[1:4] == ['shell', 'uiautomator', 'dump'] and args[-1].endswith('kairos-startup-ready.xml'):
                self.assertEqual(calls[i-1], ['adb', 'shell', 'rm', '-f', '/sdcard/kairos-startup-ready.xml'])

    def test_readiness_failure_preserves_all_measured_timings_and_limit_failure(self):
        result = self.run_gate(times=(2152, 2073, 1333), unready_sample=3)
        self.assertEqual(result['startup']['process_cold_median_ms'], 2073)
        self.assertEqual(result['startup']['fresh_install_ms'], 2152)
        self.assertEqual(result['startup']['status'], 'FAIL')
        self.assertIn('PIN setup', result['error'])
        self.assertIn('2073 ms', result['error'])
        self.assertTrue(result['status']['functional_complete'])

    def test_persistent_dumper_errors_and_partial_xml_cannot_pass_readiness(self):
        for settings in ({'failed_startup_dumps': 100}, {'malformed_sample': 1}):
            with self.subTest(settings=settings):
                result = self.run_gate(**settings)
                self.assertEqual(result['startup']['status'], 'FAIL')
                self.assertEqual(len(result['startup']['samples']), 1)
                self.assertIn('PIN setup', result['error'])
                self.assertTrue(result['status']['functional_complete'])


class BenchmarkApkTest(unittest.TestCase):
    def setUp(self):
        self.verify = runpy.run_path(str(SCRIPTS / 'verify-benchmark-apk.py'))['verify_badging']
        self.badging = "package: name='app.kairos.money' versionCode='4'\nlaunchable-activity: name='app.kairos.money.MainActivity' label='Kairos Money'\n"

    def test_real_release_equivalent_package_is_accepted(self):
        self.verify(self.badging)

    def test_debuggable_apk_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'debuggable'):
            self.verify(self.badging + 'application-debuggable\n')

    def test_different_package_or_launcher_is_rejected(self):
        for original in ("name='app.kairos.money'", "name='app.kairos.money.MainActivity'"):
            with self.subTest(original=original), self.assertRaises(RuntimeError):
                self.verify(self.badging.replace(original, "name='other.app'"))


if __name__ == '__main__':
    unittest.main()

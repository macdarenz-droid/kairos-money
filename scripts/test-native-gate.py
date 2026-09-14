"""Host-only runner regressions. Every subprocess is mocked; no device is touched."""
import contextlib
import io
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
    'RevisionInstrumentedTest': 2, 'IntelligenceInstrumentedTest': 4,
    'AccessibilityInstrumentedTest': 1, 'AcceptanceInstrumentedTest': 1,
    'PostDeleteInstrumentedTest': 1,
}


class NativeGateTest(unittest.TestCase):
    def run_gate(self, times=(1600, 1700, 1800), launch_state='COLD', fail_class=None, missing_time=False, emulator=True, existing_install=False):
        calls = []
        samples = iter(times)

        def command(args, **_kwargs):
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
            elif args[1:3] == ['shell', 'cat']:
                output = ('<node package="app.kairos.money" text="Create private ledger"/>'
                          if args[-1].endswith('kairos-startup-ready.xml') else '<node package="com.android.launcher3"/>')
            elif args[1:4] == ['shell', 'am', 'start'] and '-n' in args:
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
            with patch('subprocess.run', side_effect=command), patch('subprocess.Popen', return_value=MagicMock()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    runpy.run_path(str(runner), run_name='__main__')
                except RuntimeError as caught:
                    error = str(caught)
            evidence = root / 'docs/evidence'
            return {
                'error': error, 'calls': calls,
                'status': json.loads((evidence / 'native-run-status.json').read_text()),
                'startup': json.loads((evidence / 'android-cold-start.json').read_text()) if (evidence / 'android-cold-start.json').exists() else None,
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

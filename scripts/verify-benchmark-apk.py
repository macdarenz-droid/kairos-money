"""Verify the CI-only benchmark variant before it can supply startup evidence."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def verify_badging(badging):
    if re.search(r'^application-debuggable\s*$', badging, re.MULTILINE):
        raise RuntimeError('Startup benchmark APK must not be debuggable')
    if not re.search(r"^package: name='app.kairos.money' ", badging, re.MULTILINE):
        raise RuntimeError('Unexpected benchmark package')
    if not re.search(r"^launchable-activity: name='app.kairos.money.MainActivity' ", badging, re.MULTILINE):
        raise RuntimeError('Benchmark must launch the real MainActivity')


def main():
    root = Path(__file__).resolve().parents[1]
    apk = root / 'android/app/build/outputs/apk/benchmark/app-benchmark.apk'
    build_tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/34.0.0'
    signature = subprocess.check_output([str(build_tools / 'apksigner'), 'verify', '--verbose', str(apk)], text=True)
    badging = subprocess.check_output([str(build_tools / 'aapt'), 'dump', 'badging', str(apk)], text=True)
    verify_badging(badging)
    report = {
        'status': 'PASS', 'variant': 'benchmark', 'debuggable': False,
        'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
        'signing_scope': 'CI debug key, not the private release identity',
        'signature': signature, 'badging': badging,
    }
    evidence = root / 'docs/evidence'
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / 'android-benchmark-apk.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Non-debuggable benchmark APK and signature: PASS')


if __name__ == '__main__':
    main()

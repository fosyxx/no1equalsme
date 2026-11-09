#!/usr/bin/env python3
"""Reject unsigned, stale, differently signed or non-launchable download APKs."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', nargs='?', type=Path, default=ROOT / 'No1EqualsMe.apk')
    parser.add_argument('--sdk', default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    args = parser.parse_args()
    if not args.sdk:
        parser.error('pass --sdk <Android SDK>')
    tools = Path(args.sdk) / 'build-tools/34.0.0'
    certificate = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--print-certs', str(args.apk)], text=True)
    actual = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', certificate).group(1)
    expected = (ROOT / 'android/release-signing.sha256').read_text().strip()
    assert actual == expected, 'APK signing identity changed; installed copies could not update'
    manifest = ET.parse(ROOT / 'android/app/AndroidManifest.xml').getroot()
    version = manifest.get('{http://schemas.android.com/apk/res/android}versionName')
    code = manifest.get('{http://schemas.android.com/apk/res/android}versionCode')
    badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(args.apk)], text=True)
    assert "name='" + manifest.get('package') + "'" in badging, 'wrong install package'
    assert "versionName='" + version + "'" in badging, 'stale APK version'
    assert "versionCode='" + code + "'" in badging, 'stale APK version code'
    assert "launchable-activity: name='local.trainer.morse.MainActivity'" in badging, 'activity cannot launch'
    with zipfile.ZipFile(args.apk) as apk:
        assert apk.read('assets/www/index.html') == (ROOT / 'index.html').read_bytes(), 'download APK contains stale screens'
        for name in ['words', 'languages', 'morse-signs', 'stenography', 'stenography-akopyan']:
            filename = 'data/' + name + '.json'
            assert apk.read('assets/www/' + filename) == (ROOT / filename).read_bytes(), 'stale offline data: ' + name
        assert len(apk.read('classes.dex')) > 1000, 'native activity is missing'
    print('Release APK: signature, stable certificate, launch activity, version, current screens and all offline datasets verified.')


if __name__ == '__main__':
    main()

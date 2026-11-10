#!/usr/bin/env python3
"""Build the complete offline Android app, optionally signing an installable release."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    parser.add_argument('--ecj-jar', type=Path, help='Optional Eclipse Java compiler; useful with JDK 21 and build-tools 34 D8')
    parser.add_argument('--keystore', type=Path)
    parser.add_argument('--keystore-password-file', type=Path)
    parser.add_argument('--key-alias', default='release')
    args = parser.parse_args()
    if not args.sdk:
        parser.error('set ANDROID_HOME or pass --sdk (platforms;android-33 and build-tools;34.0.0)')
    sdk = Path(args.sdk)
    if bool(args.keystore) != bool(args.keystore_password_file):
        parser.error('--keystore and --keystore-password-file must be supplied together')
    manifest = ROOT / 'android/app/AndroidManifest.xml'
    version = ET.parse(manifest).getroot().get('{http://schemas.android.com/apk/res/android}versionName')
    tools = sdk / 'build-tools/34.0.0'
    platform = sdk / 'platforms/android-33/android.jar'
    for required in [tools / 'aapt', tools / 'd8', tools / 'zipalign', platform]:
        if not required.is_file():
            parser.error(f'missing Android SDK tool: {required}')
    build = ROOT / 'android/build'
    build.mkdir(exist_ok=True)
    work = build / 'work'
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    resources = work / 'res'
    shutil.copytree(ROOT / 'android/app/res', resources)
    assets = work / 'assets'
    assets.mkdir()
    values = resources / 'values'
    values.mkdir()
    (values / 'strings.xml').write_text('<resources><string name="app_name">No1EqualsMe ' + version + '</string></resources>', encoding='utf-8')
    www = assets / 'www'
    www.mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'index.html', www / 'index.html')
    for directory in ['data', 'assets']:
        shutil.copytree(ROOT / directory, www / directory, dirs_exist_ok=True)
    (assets / 'app-update.json').write_text('{"remote":"https://raw.githubusercontent.com/fosyxx/no1equalsme/main"}\n', encoding='utf-8')
    classes = work / 'classes'
    classes.mkdir()
    sources = sorted((ROOT / 'android/app/src').rglob('*.java'))
    # Calling the JDK compiler through java also works in images without a javac launcher.
    if args.ecj_jar:
        run('java', '-jar', args.ecj_jar, '-8', '-g', '-bootclasspath', platform, '-d', classes, *sources)
    else:
        run('java', 'com.sun.tools.javac.Main', '-source', '8', '-target', '8', '-g',
            '-classpath', platform, '-d', classes, *sources)
    dex = work / 'dex'
    dex.mkdir()
    run(tools / 'd8', '--min-api', '23', '--lib', platform, '--output', dex, *sorted(classes.rglob('*.class')))
    unaligned = work / 'unaligned.apk'
    run(tools / 'aapt', 'package', '-f', '-M', ROOT / 'android/app/AndroidManifest.xml',
        '-S', resources, '-A', assets, '-I', platform, '-F', unaligned)
    with zipfile.ZipFile(unaligned, 'a', compression=zipfile.ZIP_DEFLATED) as apk:
        for file in sorted(dex.glob('*.dex')):
            apk.write(file, file.name)
    output = build / ('No1EqualsMe-' + version + '-unsigned.apk')
    run(tools / 'zipalign', '-f', '4', unaligned, output)
    run(tools / 'zipalign', '-c', '4', output)
    print(f'Unsigned APK: {output}')
    if args.keystore:
        signed = build / 'No1EqualsMe.apk'
        run(tools / 'apksigner', 'sign', '--ks', args.keystore, '--ks-key-alias', args.key_alias,
            '--ks-pass', 'file:' + str(args.keystore_password_file),
            '--out', signed, output)
        run(tools / 'apksigner', 'verify', '--verbose', signed)
        print(f'Installable signed APK: {signed}')
    else:
        print('Developer build: provide --keystore and --keystore-password-file for an installable signed release.')


if __name__ == '__main__':
    main()

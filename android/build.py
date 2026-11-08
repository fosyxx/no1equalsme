#!/usr/bin/env python3
"""Build the offline Android shell with official SDK tools; never replace the signed release."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    parser.add_argument('--base-apk', type=Path, default=ROOT / 'No1EqualsMe.apk',
                        help='Original signed APK supplies launcher artwork and offline audio missing from source')
    parser.add_argument('--ecj-jar', type=Path, help='Optional Eclipse Java compiler; useful with JDK 21 and build-tools 34 D8')
    args = parser.parse_args()
    if not args.sdk:
        parser.error('set ANDROID_HOME or pass --sdk (platforms;android-33 and build-tools;34.0.0)')
    sdk = Path(args.sdk)
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
    resources.mkdir()
    assets = work / 'assets'
    assets.mkdir()
    # The repository retains its original signed APK for backward compatibility.
    # Recover only its artwork/audio/assets, never its executable code or signatures.
    with zipfile.ZipFile(args.base_apk) as original:
        for info in original.infolist():
            name = info.filename
            if name.startswith('assets/') or (name.startswith('res/mipmap-') and name.endswith('.png')):
                parts = Path(name).parts
                if '..' in parts:
                    raise ValueError(f'unsafe APK member: {name}')
                target = work / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(original.read(info))
    values = resources / 'values'
    values.mkdir()
    (values / 'strings.xml').write_text('<resources><string name="app_name">No1EqualsMe</string></resources>', encoding='utf-8')
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
    output = build / 'No1EqualsMe-1.16-unsigned.apk'
    run(tools / 'zipalign', '-f', '4', unaligned, output)
    run(tools / 'zipalign', '-c', '4', output)
    print(f'Unsigned APK: {output}')
    print('Sign with the ORIGINAL release keystore using apksigner before installation. No signing key is stored here.')


if __name__ == '__main__':
    main()

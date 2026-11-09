#!/usr/bin/env python3
"""Execute native cache and WebView response regressions on a regular JDK."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    parser.add_argument('--json-jar', type=Path, default=os.environ.get('JSON_JAR'),
                        help='org.json 20240303 JAR (executable JSON implementation for JVM tests)')
    args = parser.parse_args()
    if not args.sdk or not args.json_jar:
        parser.error('pass --sdk <Android SDK> and --json-jar <org.json JAR>')
    platform = Path(args.sdk) / 'platforms/android-33/android.jar'
    if not platform.is_file() or not args.json_jar.is_file():
        parser.error('Android platform 33 or org.json JAR is missing')
    with tempfile.TemporaryDirectory(prefix='nem-native-') as temporary:
        sources = sorted((ROOT / 'android/app/src').rglob('*.java'))
        sources += sorted((ROOT / 'android/test').rglob('*.java'))
        classpath = os.pathsep.join([str(args.json_jar), str(platform)])
        subprocess.run(['java', 'com.sun.tools.javac.Main', '-source', '8', '-target', '8',
                        '-classpath', classpath, '-d', temporary, *map(str, sources)], check=True)
        runtime = os.pathsep.join([temporary, classpath])
        for test in ['ContentRegression', 'RespondRegression']:
            subprocess.run(['java', '-classpath', runtime,
                            'local.trainer.morse.' + test, str(ROOT)], check=True)


if __name__ == '__main__':
    main()

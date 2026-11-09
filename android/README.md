# Android

`app/src/local/trainer/morse/MainActivity.java` is the native offline wrapper. It serves
`https://morse.local/` from validated cached data, falling back to packaged assets
when an update is corrupt, incompatible, unreadable or too large. Background updates
never block WebView rendering. The WebView origin and package name are preserved,
so updates signed with the original certificate retain the existing progress.

Build with JDK 17 and the official Android SDK packages `platforms;android-33` and
`build-tools;34.0.0`:

```sh
python3 android/build.py --sdk "$ANDROID_HOME"
npm run test:apk -- android/build/No1EqualsMe-1.16-unsigned.apk
```

With JDK 21, build-tools 34's D8 rejects some javac-generated class metadata. Use
the optional `--ecj-jar /path/to/ecj-3.38.0.jar` compiler (Eclipse ECJ from Maven
Central) to produce Java 8 bytecode compatible with D8. This path was also tested.

Native cache and HTTP response tests run on a regular JDK, using the Android SDK
and `org.json:json:20240303` from Maven Central:

```sh
npm run test:native -- --sdk "$ANDROID_HOME" --json-jar /path/to/json-20240303.jar
```

These execute the actual Java response handler with small Android storage/transport
test doubles. They cover valid updates, corrupted and oversized caches, packaged
fallback, JSON compatibility, byte ranges and missing assets. A physical Android
device is still needed for a full WebView/device integration check.

The original `No1EqualsMe.apk` (1.15) is retained as a source of offline audio and
launcher artwork not fully present in the source tree. It does **not** contain the
new fixes. The build overlays the current `index.html`, `data/` and `assets/` and
compiles the native Java source into a new, aligned **unsigned** 1.16 APK.

To distribute an update, sign the new APK with the **original release keystore**
and check the resulting certificate against `No1EqualsMe.apk`:

```sh
"$ANDROID_HOME/build-tools/34.0.0/apksigner" sign --ks /secure/path/original.jks \
  --out android/build/No1EqualsMe-1.16.apk android/build/No1EqualsMe-1.16-unsigned.apk
"$ANDROID_HOME/build-tools/34.0.0/apksigner" verify --verbose --print-certs android/build/No1EqualsMe-1.16.apk
"$ANDROID_HOME/build-tools/34.0.0/apksigner" verify --verbose --print-certs No1EqualsMe.apk
```

Passwords are requested by `apksigner`. The signing key is not in this repository.
A different key cannot update the installed application while retaining its data;
do not replace the existing release with a newly generated signature.

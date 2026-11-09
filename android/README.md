# Android

The user download is the signed `No1EqualsMe.apk` at the repository root and in
[Release v1.17](https://github.com/fosyxx/no1equalsme/releases/tag/v1.17).
It includes all data offline and Pi practice directly on the home screen.

## Installation identity

Version 1.17 uses package `local.trainer.no1equalsme`, launcher label
`No1EqualsMe 1.17` and a permanent new signing certificate. The old 1.15 package
`local.trainer.morse` cannot receive an in-place update without its original key.
Both installations coexist, preserving the old application's data. Progress is
separate and is not automatically migrated. Future releases of the new package
must reuse the new key; its public fingerprint is in `release-signing.sha256`.

The private key and password are excluded from Git in `.release/`; a private
backup is saved separately in the task workspace. Never publish the key or its
password. The connected GitHub integration cannot manage Actions secrets, so CI
verifies the checked-in signed download and produces unsigned developer builds.

## Build

Use JDK 17, Android SDK `platforms;android-33` and `build-tools;34.0.0`:

```sh
python3 android/build.py --sdk "$ANDROID_HOME"
```

With JDK 21, pass `--ecj-jar /path/to/ecj-3.38.0.jar` (Eclipse ECJ from Maven
Central) for compatibility with build-tools 34 D8. All assets, offline audio and
launcher artwork are source files; no prior APK is required.

To make an installable release with the existing PKCS12 release key:

```sh
python3 android/build.py --sdk "$ANDROID_HOME" \
  --keystore /secure/path/no1equalsme-release.p12 \
  --keystore-password-file /secure/path/keystore-password.txt
cp android/build/No1EqualsMe.apk No1EqualsMe.apk
python3 android/verify_release.py --sdk "$ANDROID_HOME"
npm run test:apk
```

The signed file is `android/build/No1EqualsMe.apk`. An unsigned developer file is
also written with the version in its filename. The verifier rejects stale screens,
wrong versions, missing launch activities, unsigned files and unexpected keys.
Tag the verified signed root file and link its raw tag URL in the release notes.
This provides a direct APK download without requiring GitHub Actions login.

## Native tests

With executable `org.json:json:20240303` from Maven Central:

```sh
npm run test:native -- --sdk "$ANDROID_HOME" --json-jar /path/to/json-20240303.jar
```

These execute the actual Java response handler with small Android storage and
transport test doubles: corrupt/oversized cache fallback, JSON compatibility,
byte ranges and missing assets. APK UI checks execute its exact offline assets.
A physical Android device is still needed for a full device integration check.

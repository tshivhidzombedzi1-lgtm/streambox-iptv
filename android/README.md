# YokoTV Android app (Android TV + phones)

A full-screen WebView around https://yokotv.online. The design and features all come from
the website, so site updates reach the app without an app update. The plan and reasoning
are in [docs/ANDROID_APP.md](../docs/ANDROID_APP.md).

| | |
|---|---|
| Package | `online.yokotv.app` |
| Android | 5.0+ (minSdk 21), target 36 |
| Code | `app/src/main/java/online/yokotv/app/` (`MainActivity.kt`, `AppBridge.kt`) |
| Build | GitHub Actions, `.github/workflows/android.yml` |

## Getting the APK

Every push that changes `android/` builds the app. Open the repo on GitHub, go to
**Actions → Android app →** the latest run, and download the `yokotv-android-…` artifact
(a zip with `yokotv.apk` inside). You can also start a build by hand with **Run workflow**.

- **Without signing secrets** you get a *debug* APK. It installs and works, but each build
  is signed with a different throwaway key, so uninstall the old one before installing a new one.
- **With signing secrets** you get a signed *release* APK that updates in place. Set this up
  once before giving the app to viewers.

## Signing (once, on your own PC)

The GitHub repo is public, so the keystore and its passwords only go into GitHub Secrets.
Never commit them. `android/.gitignore` already blocks `*.jks` and `*.keystore`.

1. Create the key (needs Java's `keytool`; any JDK 17+ has it):

   ```bash
   keytool -genkeypair -v -keystore yokotv-upload.jks -alias yokotv -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Turn it into text:

   ```bash
   base64 -w0 yokotv-upload.jks > yokotv-upload.b64
   ```

   On Windows PowerShell:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\yokotv-upload.jks")) | Set-Content -Encoding ascii yokotv-upload.b64
   ```

3. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE` | contents of `yokotv-upload.b64` |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
   | `ANDROID_KEY_ALIAS` | `yokotv` |
   | `ANDROID_KEY_PASSWORD` | the key password |

4. Back up `yokotv-upload.jks` and the passwords somewhere safe, outside the repo. If they
   are lost, installed apps can't be updated; viewers would have to reinstall.

## Installing

- **Android TV / Google TV box:** install the *Downloader* app, enter the APK's URL, and
  allow installs from Downloader when asked. You can also copy the APK over on a USB stick
  and open it with a file manager.
- **Phone:** open the APK and allow installs from that source.

## What the app does

- Shows on the Android TV home screen with its banner, and in the phone app drawer.
- Adds `YokoTVApp/<version>` to the user agent, plus `Android TV` on TVs, which switches on
  the site's TV mode (remote navigation, big focus rings, no ads). In the app the site
  also hides Google sign-in, AdSense and the Install button, and Premium is bought on the
  website.
- Full screen with the screen kept on: always on TV, and on phones while a channel plays.
  The player's full-screen button turns the phone to landscape.
- BACK closes full-screen video, then an open sheet, then goes back a page, then to the home
  page. On the home page, pressing it twice exits.
- Links to other sites open in their app or a Custom Tab on phones. TVs have no browser,
  so they show where to open the link instead.
- An offline screen with Retry. It also retries by itself when the connection comes back.

## Local builds (optional)

Only needed if you want Android Studio. Open the `android/` folder and run the `app`
configuration, or run `./gradlew assembleDebug`. Add `-Pplay=true` for a Play Store build,
in which the app never sends Premium payments to the browser.

# YokoTV Android app (Android TV + phones)

**Goal:** one Android app, installable on Android TV / Google TV boxes and on phones, that
gives viewers YokoTV with a proper launcher icon, remote control support and full-screen
playback. **It wraps the live website (https://yokotv.online).** The web app already does
everything: channels, TV guide, TV mode for remotes, accounts, Premium. Do not rebuild
screens natively and do not start a new UI. Every improvement to the site then reaches the
app automatically, with no app update.

## Architecture

```
android/                      ← new Android Studio project, in this repo
  app/src/main/
    AndroidManifest.xml       TV + phone in one APK
    java/online/yokotv/app/
      MainActivity.kt         full-screen WebView → https://yokotv.online/?source=android
      (optional) PlayerActivity.kt   native ExoPlayer, phase 2
    res/                      icon, TV banner, splash, offline screen
.github/workflows/android.yml ← builds the APK on every push (no Android SDK needed locally)
```

- Language: Kotlin. Package / applicationId: `online.yokotv.app`. minSdk 21 (old TV boxes),
  target/compileSdk: latest stable.
- One APK for both form factors:
  - `<uses-feature android:name="android.software.leanback" android:required="false"/>`
  - `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>`
  - The activity has both `LAUNCHER` and `LEANBACK_LAUNCHER` intent filters.
  - `android:banner="@drawable/banner"` (320×180 dp) on the application, which Android TV
    requires for its home screen.

## MainActivity: the WebView shell

1. **Detect TV** with `UiModeManager.currentModeType == UI_MODE_TYPE_TELEVISION` or
   `packageManager.hasSystemFeature(FEATURE_LEANBACK)`.
2. **User agent:** keep the default and append ` YokoTVApp/<versionName>`. On TV also append
   ` Android TV`, which makes the site's `isTV` check (`client/src/lib/catalog.ts`) switch on
   TV mode: remote navigation, big focus rings, no blur, no ads. Don't change the site's
   detection; it already matches `android tv`.
3. **WebView settings:** JavaScript and DOM storage on,
   `mediaPlaybackRequiresUserGesture = false`, `MIXED_CONTENT_COMPATIBILITY_MODE` (a few
   streams are http), cookies and third-party cookies on (sign-in session), and a cache mode
   that prefers the network.
4. **Full screen:** immersive mode (hide the system bars) and `FLAG_KEEP_SCREEN_ON`. Implement
   `WebChromeClient.onShowCustomView` / `onHideCustomView` so the player's full-screen button
   works.
5. **Back button / remote BACK:** if `webView.canGoBack()`, go back. On the home page, a
   second press within 2 s exits, with a toast "Press back again to exit". The player page
   (`/watch/...`) already handles Escape/Back in JS, so let the page see the key first.
6. **D-pad:** the WebView passes arrow and enter keys to the page, and TV mode handles focus.
   Make sure the WebView has focus on start (`requestFocus()`).
7. **Links:** stay in the app for `yokotv.online`. Open everything else (Stripe checkout,
   Google, sponsor links) with Custom Tabs on phones. On TV, do nothing, because the site
   will show a QR code instead (see below).
8. **Offline / error screen:** a native view with the logo, "Can't reach YokoTV" and a
   Retry button, shown on `onReceivedError` for the main frame.
9. **Splash:** the Android 12 SplashScreen API, background `#08090d`, the YokoTV mark.
10. `?source=android` (or `androidtv`) on the start URL, so `/admin` stats show app traffic.

## Changes the website needs (small, in `client/src` and `server/seo.ts`)

Detect the app with `/YokoTVApp/` in `navigator.userAgent` (client) and
`req.headers["user-agent"]` (server). Add an `isApp` export next to `isTV`.

- **Google sign-in:** Google blocks OAuth inside WebViews (`disallowed_useragent`). In the
  app, hide the Google button and One Tap (`client/src/lib/google.ts`,
  `components/Account.tsx`) and keep email + password. Later: native Credential Manager plus
  a JS bridge that posts the ID token to `/api/account/google`.
- **Payments:** Google Play requires Play Billing for digital subscriptions bought inside an
  app. For a Play Store build, don't start Stripe checkout in the app. On `/premium`, show
  "Get Premium at yokotv.online/premium" with a QR code (TV) or open the browser (phone,
  sideloaded builds only). Premium bought on the web works in the app, because it's the same
  account.
- **Ads:** AdSense isn't allowed in WebView apps unless they're registered through the Google
  Mobile Ads SDK. For now, leave ads off in the app: add `/YokoTVApp/` to the `TV_UA` check in
  `server/seo.ts` and to `useAds` in `AdSlot.tsx`. Sponsor banners (our own) are fine to keep.
  AdMob can come later.
- **Install banner:** hide the site's PWA "Install" button inside the app (`InstallButton` in
  `components/TV.tsx`).

## Phase 2 (only after phase 1 ships): native playback

On weak TV boxes, hls.js in a WebView can stutter. Add a JS bridge
(`window.YokoTVNative.play(json)`) that the site calls from `TVPlayer.tsx` when it exists. It
opens `PlayerActivity` with Media3 ExoPlayer (HLS), passing the stream list from
`/api/streams/:id`, and the headers `ua` and `r` (referer) the stream needs. Keep the web
player as the fallback. Channel up/down on the remote flips channels, the same as N/P in the
web player.

## Build, signing, distribution

- **CI:** `.github/workflows/android.yml` on `ubuntu-latest`: set up JDK 17, cache Gradle,
  run `./gradlew assembleRelease` in `android/`, upload the APK as an artifact.
- **Signing:** create an upload keystore once, on the owner's PC. Store it base64-encoded in
  GitHub Secrets (`ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`). **Never commit the keystore** (the repo is public). Without the
  secrets, CI builds a debug APK.
- **Sideload first** (most South African Android TV boxes): publish the APK at
  `https://yokotv.online/app/yokotv.apk`. Add a `/app` page on the site with install steps
  (Downloader app → URL/code, or USB). Add `/app` to the footer.
- **Play Store later:** an AAB (`bundleRelease`), the TV banner, TV screenshots, a privacy
  policy link (`/privacy`), and the payment rule above.

## Test checklist

- Android TV emulator (or a real box): the app shows on the TV home row with its banner, the
  remote moves around, OK opens a channel, BACK leaves the player and then the app, and
  video plays full screen with no system bars.
- Phone: portrait browsing, landscape full-screen playback, back behaviour, email sign-in,
  My List stays in sync with the website account.
- No Google button or ads in the app, and Premium links to the web.
- Offline: airplane mode shows the retry screen, and Retry recovers.

## Assets

`docs/brand/` in this repo (also served at `/brand/…` on the site) has the logo:
`yokotv-icon-512.png` (app icon source) and `yokotv-mark.svg` (a rounded dark square
`#0B0D12` with a play triangle and a dot in the gradient `#5EC8FF → #6C6BF5`). Make the TV
banner 320×180 dp: a dark `#08090d` background, the mark on the left, "YokoTV" in Space
Grotesk.

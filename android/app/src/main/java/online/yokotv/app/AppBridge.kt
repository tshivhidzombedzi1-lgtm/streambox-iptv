package online.yokotv.app

import android.webkit.JavascriptInterface

/**
 * `window.YokoTVApp` on the website. Kept deliberately small: the site uses it to
 * hand Premium payments over to the browser (see client/src/pages/Premium.tsx).
 * Called on WebView's JavaBridge thread, not the UI thread.
 */
class AppBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun isTV(): Boolean = activity.isTv

    /**
     * Opens a yokotv.online page in the phone's browser. Returns false when that
     * isn't allowed (TV, Play Store builds, or a link to another site), and the
     * site then shows the address and a QR code instead.
     */
    @JavascriptInterface
    fun openInBrowser(url: String?): Boolean = activity.openSiteInBrowser(url)
}

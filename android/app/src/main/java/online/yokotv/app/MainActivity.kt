package online.yokotv.app

import android.annotation.SuppressLint
import android.app.UiModeManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import androidx.core.net.toUri
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * YokoTV for Android TV and phones: a full-screen WebView around https://yokotv.online.
 * The website does the rest (channels, guide, accounts, TV mode for remotes); see
 * docs/ANDROID_APP.md.
 */
class MainActivity : ComponentActivity() {

    /** True on Android TV / Google TV. Read by [AppBridge] on another thread. */
    @Volatile
    var isTv = false
        private set

    private lateinit var root: FrameLayout
    private lateinit var offline: View
    private lateinit var offlineBody: TextView
    private lateinit var retry: Button
    private var webView: WebView? = null

    private val handler = Handler(Looper.getMainLooper())
    private var keepSplash = true
    private var mainFrameFailed = false
    private var failedUrl: String? = null
    private var watching = false
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var lastBackPress = 0L
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // The splash stays up until the first page paints, for at most a few seconds.
        splash.setKeepOnScreenCondition { keepSplash }
        handler.postDelayed({ keepSplash = false }, 4000)

        isTv = detectTv()
        setContentView(R.layout.activity_main)
        root = findViewById(R.id.root)
        offline = findViewById(R.id.offline)
        offlineBody = findViewById(R.id.offline_body)
        retry = findViewById(R.id.retry)
        ResourcesCompat.getFont(this, R.font.space_grotesk_bold)?.let { font ->
            findViewById<TextView>(R.id.offline_title).typeface = font
            retry.typeface = font
        }
        retry.setOnClickListener { retryLoad() }

        setupWindow()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = onBack()
        })

        val web = createWebView()
        if (web == null) {
            showOffline(R.string.webview_body)
            return
        }
        attachWebView(web)
        if (isOnline()) {
            web.loadUrl(startUrl())
        } else {
            failedUrl = startUrl()
            showOffline(R.string.offline_body)
        }
    }

    // ---- setup ----

    private fun detectTv(): Boolean {
        val ui = getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        return ui.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    /** `?source=` lets the /admin stats tell app traffic apart. */
    private fun startUrl() = BuildConfig.START_URL + if (isTv) "?source=androidtv" else "?source=android"

    private fun setupWindow() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        // Keep the page clear of the status bar, navigation bar, notch and keyboard
        // (all zero while the bars are hidden).
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        updateSystemBars()
    }

    /**
     * TV: always full screen with the screen kept on. Phone: normal (dark) system bars
     * while browsing, full screen and screen on while a channel plays.
     */
    private fun updateSystemBars() {
        val immersive = isTv || watching || customView != null
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
        if (immersive) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    /** Null when the device's System WebView is missing or being updated. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView? {
        val web = try {
            WebView(this)
        } catch (e: Exception) {
            return null
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.yoko_bg))
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE // a few streams are http
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            setSupportMultipleWindows(true) // window.open / target=_blank → onCreateWindow
            javaScriptCanOpenWindowsAutomatically = true
            // "YokoTVApp/" tells the site it runs in the app; "Android TV" turns on its TV mode.
            userAgentString = userAgentString + " YokoTVApp/" + BuildConfig.VERSION_NAME + if (isTv) " Android TV" else ""
            if (isTv) textZoom = 100 // the site's TV layout is sized for the screen already
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }
        web.addJavascriptInterface(AppBridge(this), "YokoTVApp")
        web.webViewClient = SiteClient()
        web.webChromeClient = ChromeClient()
        return web
    }

    private fun attachWebView(web: WebView) {
        webView = web
        root.addView(web, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        web.requestFocus()
    }

    // ---- page loading, offline screen ----

    private inner class SiteClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            request.isForMainFrame && routeOutside(request.url)

        @Deprecated("Android 5 and 6 only")
        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = routeOutside(url.toUri())

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            mainFrameFailed = false
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            keepSplash = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            keepSplash = false
            if (!mainFrameFailed) {
                failedUrl = null
                showWeb()
            }
        }

        // Page changes inside the site (it's a single-page app) also land here.
        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            val nowWatching = url?.toUri()?.path?.startsWith("/watch/") == true
            if (nowWatching != watching) {
                watching = nowWatching
                updateSystemBars()
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) pageFailed(request.url.toString(), R.string.offline_body)
        }

        @Deprecated("Android 5 only")
        override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
            if (Build.VERSION.SDK_INT < 23) pageFailed(failingUrl, R.string.offline_body)
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (request.isForMainFrame && response.statusCode >= 500) pageFailed(request.url.toString(), R.string.server_body)
        }

        // Weak TV boxes sometimes kill the web renderer; start a fresh WebView instead of crashing.
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            val url = view.url
            if (customView != null) hideCustomView()
            root.removeView(view)
            view.destroy()
            webView = null
            val fresh = createWebView() ?: run { showOffline(R.string.webview_body); return true }
            attachWebView(fresh)
            fresh.loadUrl(url ?: startUrl())
            return true
        }
    }

    private fun pageFailed(url: String?, message: Int) {
        mainFrameFailed = true
        failedUrl = url ?: startUrl()
        showOffline(message)
    }

    private fun showOffline(message: Int) {
        keepSplash = false
        if (customView != null) hideCustomView()
        offlineBody.setText(message)
        retry.isEnabled = true
        retry.setText(R.string.retry)
        webView?.visibility = View.INVISIBLE
        offline.visibility = View.VISIBLE
        retry.requestFocus()
    }

    private fun showWeb() {
        if (offline.visibility != View.VISIBLE && webView?.visibility == View.VISIBLE) return
        offline.visibility = View.GONE
        webView?.visibility = View.VISIBLE
        webView?.requestFocus()
    }

    private fun retryLoad() {
        val web = webView
        if (web == null) {
            recreate() // try to create the WebView again
            return
        }
        retry.isEnabled = false
        retry.setText(R.string.retrying)
        mainFrameFailed = false
        web.loadUrl(failedUrl ?: startUrl())
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        if (Build.VERSION.SDK_INT >= 23) {
            val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
            return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
        @Suppress("DEPRECATION")
        return cm.activeNetworkInfo?.isConnected == true
    }

    /** Retries by itself when the connection comes back (Android 7+). */
    private fun watchNetwork() {
        if (Build.VERSION.SDK_INT < 24 || networkCallback != null) return
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handler.post { if (offline.visibility == View.VISIBLE && retry.isEnabled && webView != null) retryLoad() }
            }
        }
        try {
            cm.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (e: RuntimeException) {
            // Some boxes limit callbacks; the Retry button still works.
        }
    }

    private fun unwatchNetwork() {
        val callback = networkCallback ?: return
        networkCallback = null
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        try {
            cm.unregisterNetworkCallback(callback)
        } catch (e: RuntimeException) {
            // already unregistered
        }
    }

    // ---- links ----

    private fun isSiteHost(host: String?): Boolean {
        val h = host?.lowercase() ?: return false
        return h == BuildConfig.SITE_HOST || h.endsWith("." + BuildConfig.SITE_HOST)
    }

    /** True when the link left the app (or was blocked); yokotv.online stays inside. */
    private fun routeOutside(uri: Uri): Boolean {
        when (uri.scheme?.lowercase()) {
            "http", "https" -> if (isSiteHost(uri.host)) return false
            "about", "data", "blob", "javascript" -> return false
        }
        openOutside(uri)
        return true
    }

    /**
     * Phones: an installed app for the link (WhatsApp, Facebook, mail…) or else a Custom
     * Tab. TVs have no browser to hand over to, so they say where to open it instead.
     */
    private fun openOutside(uri: Uri) {
        val scheme = uri.scheme?.lowercase()
        if (isTv) {
            val where = if (scheme == "mailto") uri.schemeSpecificPart else uri.host ?: uri.toString()
            Toast.makeText(this, getString(R.string.open_on_phone, where), Toast.LENGTH_LONG).show()
            return
        }
        try {
            when (scheme) {
                "http", "https" -> {
                    if (Build.VERSION.SDK_INT >= 30) {
                        try {
                            startActivity(
                                Intent(Intent.ACTION_VIEW, uri)
                                    .addCategory(Intent.CATEGORY_BROWSABLE)
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER)
                            )
                            return
                        } catch (e: ActivityNotFoundException) {
                            // no app for it: use the browser below
                        }
                    }
                    customTab(uri)
                }
                "intent" -> {
                    val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                        addCategory(Intent.CATEGORY_BROWSABLE)
                        component = null
                        selector = null
                    }
                    try {
                        startActivity(intent)
                    } catch (e: ActivityNotFoundException) {
                        val fallback = intent.getStringExtra("browser_fallback_url")
                        if (fallback != null) customTab(fallback.toUri()) else throw e
                    }
                }
                else -> startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        } catch (e: Exception) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun customTab(uri: Uri) {
        val bg = ContextCompat.getColor(this, R.color.yoko_bg)
        val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(bg).setNavigationBarColor(bg).build()
        val tab = CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(colors)
            .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
            .setShowTitle(true)
            .build()
        try {
            tab.launchUrl(this, uri)
        } catch (e: ActivityNotFoundException) {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        }
    }

    /** For [AppBridge]: only yokotv.online pages, only on phones, never in Play builds. */
    fun openSiteInBrowser(url: String?): Boolean {
        if (BuildConfig.PLAY_BUILD || isTv || url == null) return false
        val uri = url.toUri()
        if (uri.scheme != "https" || !isSiteHost(uri.host)) return false
        handler.post { customTab(uri) }
        return true
    }

    // ---- full-screen video, window.open ----

    private inner class ChromeClient : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customViewCallback = callback
            view.setBackgroundColor(Color.BLACK)
            root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            if (!isTv) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            updateSystemBars()
            view.requestFocus()
        }

        override fun onHideCustomView() = hideCustomView()

        // No grey placeholder over the video before it starts.
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

        // window.open / target=_blank (share buttons, sponsor links): catch the first URL
        // in a throwaway WebView and route it like any other link.
        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            val popup = WebView(this@MainActivity)
            var handled = false
            fun take(url: Uri) {
                if (handled) return
                handled = true
                if (isSiteHost(url.host)) webView?.loadUrl(url.toString()) else openOutside(url)
                handler.post { popup.destroy() }
            }
            popup.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                    take(request.url)
                    return true
                }

                @Deprecated("Android 5 and 6 only")
                override fun shouldOverrideUrlLoading(v: WebView, url: String): Boolean {
                    take(url.toUri())
                    return true
                }

                override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) {
                    if (url != null && url != "about:blank") {
                        v.stopLoading()
                        take(url.toUri())
                    }
                }
            }
            (resultMsg.obj as WebView.WebViewTransport).webView = popup
            resultMsg.sendToTarget()
            return true
        }
    }

    private fun hideCustomView() {
        val view = customView ?: return
        customView = null
        root.removeView(view)
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
        if (!isTv) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        updateSystemBars()
        webView?.requestFocus()
    }

    // ---- BACK (phone back and the remote's BACK button) ----

    private fun onBack() {
        if (customView != null) {
            hideCustomView()
            return
        }
        val web = webView
        if (web == null || offline.visibility == View.VISIBLE) {
            exitOnSecondPress()
            return
        }
        // An open sheet (sign-in, share…) closes first, the same as tapping outside it.
        web.evaluateJavascript(CLOSE_SHEET_JS) { closed ->
            when {
                closed == "true" -> Unit
                web.canGoBack() -> web.goBack()
                !isHome(web.url) -> web.loadUrl(startUrl())
                else -> exitOnSecondPress()
            }
        }
    }

    private fun isHome(url: String?): Boolean {
        val uri = url?.toUri() ?: return true
        return isSiteHost(uri.host) && (uri.path.isNullOrEmpty() || uri.path == "/")
    }

    private fun exitOnSecondPress() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastBackPress < 2000) {
            finish()
        } else {
            lastBackPress = now
            Toast.makeText(this, R.string.press_back_again, Toast.LENGTH_SHORT).show()
        }
    }

    // ---- lifecycle ----

    override fun onStart() {
        super.onStart()
        watchNetwork()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        webView?.resumeTimers()
        // Lets the site refresh the account (e.g. after paying for Premium in the browser).
        webView?.evaluateJavascript("window.dispatchEvent(new Event('yokotvapp:resume'))", null)
        updateSystemBars()
    }

    override fun onPause() {
        // Leaving the app (HOME on the remote) stops the channel.
        webView?.evaluateJavascript("document.querySelectorAll('video').forEach(function(v){v.pause()})", null)
        webView?.onPause()
        webView?.pauseTimers()
        CookieManager.getInstance().flush() // keep the sign-in
        super.onPause()
    }

    override fun onStop() {
        unwatchNetwork()
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) updateSystemBars()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        webView?.let {
            root.removeView(it)
            it.destroy()
        }
        webView = null
        super.onDestroy()
    }

    private companion object {
        const val CLOSE_SHEET_JS =
            "(function(){var b=document.querySelector('.sheet-backdrop');if(b){b.click();return true}return false})()"
    }
}

# The JavaScript bridge (window.YokoTVApp) is called by name from the website.
-keepclassmembers class online.yokotv.app.AppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

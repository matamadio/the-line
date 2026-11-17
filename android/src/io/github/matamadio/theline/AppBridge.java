package io.github.matamadio.theline;

import android.app.Activity;
import android.webkit.JavascriptInterface;

/**
 * What the page may ask of the app, as window.TheLineApp. A web view ignores
 * window.close(), so FLATTEN on the menu calls TheLineApp.quit() instead.
 * A class of its own, with no nested ones: the build's d8 trips over those.
 */
final class AppBridge implements Runnable {
    private final Activity app;

    AppBridge(Activity app) { this.app = app; }

    /** FLATTEN: close the app, and leave nothing of it in the recent apps. */
    @JavascriptInterface
    public void quit() { app.runOnUiThread(this); }

    /** On the app's own thread. Not for the page: only @JavascriptInterface methods reach it. */
    @Override
    public void run() { app.finishAndRemoveTask(); }
}

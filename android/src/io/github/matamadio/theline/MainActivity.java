package io.github.matamadio.theline;

import android.app.Activity;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The hosted game, fullscreen. A WebView may not pass a joypad to the page, so the joypad
 * is turned into the game's keys here: the d-pad and the left stick are the arrows, A
 * wipes (Z), X pulls (X), Start pauses (P), and B or Back is the TV remote's Back, which
 * pauses a game first and goes to the menu from the pause. The joypad never reaches the
 * page as a joypad, so nothing counts twice.
 */
public class MainActivity extends Activity {
    /** ?tv: always fullscreen, no fullscreen button. ?pad: name the joypad's buttons, as they reach the game as keys. */
    private static final String URL = "https://matamadio.github.io/the-line/?tv&pad";
    /** How far the stick has to go to count, as in the game. */
    private static final float STICK = 0.5f;

    private WebView web;
    /** Which arrows the stick and the hat (a d-pad reported as axes) hold down: left, right, up, down. */
    private final boolean[] held = new boolean[4];
    private static final String[] ARROWS = { "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown" };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(0xff05030f);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // The title music may start without a tap.
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        immersive();
        web.requestFocus();
        if (saved != null) web.restoreState(saved);
        else web.loadUrl(URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /** The game's key for a joypad or remote button, as KeyboardEvent.code, or null to leave it to Android. */
    private static String codeFor(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_LEFT: return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_UP: return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "ArrowDown";
            case KeyEvent.KEYCODE_BUTTON_A: return "KeyZ";
            case KeyEvent.KEYCODE_BUTTON_X: return "KeyX";
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "KeyP";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: return "Enter";
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_BUTTON_SELECT:
            case KeyEvent.KEYCODE_BACK: return "BrowserBack";
            default: return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        String code = codeFor(e.getKeyCode());
        if (code == null) return super.dispatchKeyEvent(e);
        int action = e.getAction();
        // The game ignores repeats, and so do we: a held button is one press.
        if (action == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) send("keydown", code);
        else if (action == KeyEvent.ACTION_UP) send("keyup", code);
        return true;
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        boolean joy = (e.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        if (!joy || e.getAction() != MotionEvent.ACTION_MOVE) return super.dispatchGenericMotionEvent(e);
        float x = e.getAxisValue(MotionEvent.AXIS_X), y = e.getAxisValue(MotionEvent.AXIS_Y);
        float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X), hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        hold(0, x < -STICK || hx < -STICK);
        hold(1, x > STICK || hx > STICK);
        hold(2, y < -STICK || hy < -STICK);
        hold(3, y > STICK || hy > STICK);
        return true;
    }

    private void hold(int i, boolean down) {
        if (held[i] == down) return;
        held[i] = down;
        send(down ? "keydown" : "keyup", ARROWS[i]);
    }

    /** A key for the page, as if from a keyboard. */
    private void send(String type, String code) {
        web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('" + type + "',{code:'" + code + "',bubbles:true,cancelable:true}))", null);
    }
}

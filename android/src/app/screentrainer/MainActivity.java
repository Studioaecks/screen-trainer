// Screen Trainer for Android — the app: the game, full screen, for as long as it is in front.
package app.screentrainer;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebView;

public final class MainActivity extends Activity {
  private WebView web;
  private boolean front;

  boolean inFront() { return front; }

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);     // an idle screen is there to be looked at
    web = Host.make(this, "app");
    setContentView(web);
    immersive();
  }

  /** hide the status and navigation bars; a swipe from the edge brings them back for a moment */
  private void immersive() {
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
  }

  @Override public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) immersive();
  }

  /** Going to the background or the screen going dark. The save is written. With "Train with the screen off" the page
      is left running (Keep holds the device awake); without it the page is paused as before. */
  @Override protected void onPause() {
    front = false;
    if (web != null) { web.evaluateJavascript("window.stPause && window.stPause()", null); if (!Host.keepWanted || !Keep.isRunning()) web.onPause(); }
    super.onPause();
  }

  @Override protected void onResume() {
    super.onResume();
    front = true;
    Host.stoppedByUser = false;
    if (web != null) web.onResume();
    if (Host.keepWanted) Keep.set(this, true);
  }

  /** Back closes the Pokédex if it is open; otherwise the app goes to the background and the game waits */
  @Override public void onBackPressed() {
    if (web == null) { moveTaskToBack(true); return; }
    web.evaluateJavascript("!!(window.stBack && window.stBack())", new ValueCallback<String>() {
      @Override public void onReceiveValue(String handled) {
        if (!"true".equals(handled)) moveTaskToBack(true);
      }
    });
  }

  @Override protected void onDestroy() {
    Keep.set(this, false);
    if (web != null) { web.destroy(); web = null; }
    super.onDestroy();
  }
}

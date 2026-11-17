// Screen Trainer for Android — the screen saver: the same field while the device is charging or docked
// (Settings > Display > Screen saver). Touching a Pokémon works here too.
package app.screentrainer;

import android.service.dreams.DreamService;
import android.webkit.WebView;

public final class Dream extends DreamService {
  private WebView web;

  @Override public void onAttachedToWindow() {
    super.onAttachedToWindow();
    setInteractive(true);
    setFullscreen(true);
    setScreenBright(true);
    web = Host.make(this, "dream");
    setContentView(web);
  }

  @Override public void onDreamingStopped() {
    if (web != null) web.evaluateJavascript("window.stPause && window.stPause()", null);
    super.onDreamingStopped();
  }

  @Override public void onDetachedFromWindow() {
    if (web != null) { web.destroy(); web = null; }
    super.onDetachedFromWindow();
  }
}

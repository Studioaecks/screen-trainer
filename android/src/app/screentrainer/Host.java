// Screen Trainer for Android — the web view that the game runs in, used by the app (MainActivity) and by the
// screen saver (Dream).
//
// The game is a set of web pages packed into this app under assets/. The web view is given one made-up address,
// https://app.screentrainer.invalid/ (".invalid" can never exist on the internet), and every request it makes is
// answered here: a file from assets/ if there is one, "not found" otherwise. Nothing is fetched from anywhere else
// and nothing is sent anywhere.
package app.screentrainer;

import android.content.Context;
import android.net.Uri;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

final class Host {
  static final String HOST = "app.screentrainer.invalid";
  static final String START = "https://" + HOST + "/app/android.html";

  /** the page's wish (option "Train with the screen off"): carry on while the screen is off */
  static volatile boolean keepWanted;
  /** the Stop button of the notification was pressed: stay stopped until the app is opened again */
  static volatile boolean stoppedByUser;

  private Host() { }

  /** a web view that shows the game. mode: "app" or "dream" (the page reads it from its address) */
  static WebView make(Context ctx, String mode) {
    WebView w = new WebView(ctx);
    WebSettings s = w.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);   // the music may start by itself, as on the desktop
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setTextZoom(100);                              // the Pokédex device is laid out in fixed sizes
    s.setSupportZoom(false);
    w.setBackgroundColor(0xFF6CBC5D);                // grass, until the page has drawn the field
    w.setOverScrollMode(View.OVER_SCROLL_NEVER);
    w.setVerticalScrollBarEnabled(false);
    w.setHorizontalScrollBarEnabled(false);
    w.addJavascriptInterface(new Bridge(ctx), "AndroidHost");
    w.setWebViewClient(new Client(ctx));
    w.loadUrl(START + "?mode=" + mode);
    return w;
  }

  /** answers every request of the web view from the files in assets/ */
  static final class Client extends WebViewClient {
    private final Context ctx;
    Client(Context ctx) { this.ctx = ctx; }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
      Uri u = request.getUrl();
      String path = u == null ? null : u.getPath();
      if (u == null || !HOST.equals(u.getHost()) || path == null || path.length() < 2 || path.contains("..")) return refuse(403, "Refused");
      String name = path.substring(1);
      try {
        InputStream in = ctx.getAssets().open(name);
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse(mime(name), text(name) ? "utf-8" : null, 200, "OK", headers, in);
      } catch (IOException e) {
        return refuse(404, "Not found");
      }
    }

    /** the page never leaves the game: a link to anywhere else is not followed */
    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      Uri u = request.getUrl();
      return u == null || !HOST.equals(u.getHost());
    }

    private static WebResourceResponse refuse(int code, String why) {
      return new WebResourceResponse("text/plain", "utf-8", code, why, new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private static boolean text(String n) {
      return n.endsWith(".html") || n.endsWith(".js") || n.endsWith(".css") || n.endsWith(".json") || n.endsWith(".txt");
    }

    private static String mime(String n) {
      if (n.endsWith(".html")) return "text/html";
      if (n.endsWith(".js")) return "text/javascript";
      if (n.endsWith(".css")) return "text/css";
      if (n.endsWith(".json")) return "application/json";
      if (n.endsWith(".png")) return "image/png";
      if (n.endsWith(".gif")) return "image/gif";
      if (n.endsWith(".ttf")) return "font/ttf";
      if (n.endsWith(".txt")) return "text/plain";
      return "application/octet-stream";
    }
  }

  /** what the page may ask of the device: keep small text files (the save, the options) in the app's own folder, and stay awake */
  static final class Bridge {
    private final Context ctx;
    Bridge(Context ctx) { this.ctx = ctx; }

    private File file(String name) {
      if (name == null || !name.matches("[a-z0-9][a-z0-9._-]{0,40}")) return null;
      return new File(ctx.getFilesDir(), name);
    }

    /** the text of a file kept earlier, or an empty string */
    @JavascriptInterface public String read(String name) {
      File f = file(name);
      if (f == null || !f.isFile()) return "";
      try {
        FileInputStream in = new FileInputStream(f);
        try {
          ByteArrayOutputStream out = new ByteArrayOutputStream();
          byte[] buf = new byte[16384];
          for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
          return out.toString("UTF-8");
        } finally { in.close(); }
      } catch (IOException e) {
        return "";
      }
    }

    /** the page says whether the game should carry on with the screen off. Only the app itself, not the screen saver, asks */
    @JavascriptInterface public void keep(boolean on) {
      keepWanted = on;
      if (!on) Keep.set(ctx, false);
      else if (!stoppedByUser && ctx instanceof MainActivity && ((MainActivity) ctx).inFront()) Keep.set(ctx, true);
    }

    /** is the service that keeps the game awake running? (Mewtwo's sheet shows it) */
    @JavascriptInterface public boolean keeping() { return Keep.isRunning(); }

    /** keep a text file (written to one side first, so a save is never left half written) */
    @JavascriptInterface public boolean write(String name, String text) {
      File f = file(name);
      if (f == null || text == null || text.length() > 20000000) return false;
      File tmp = new File(f.getPath() + ".tmp");
      try {
        FileOutputStream out = new FileOutputStream(tmp);
        try { out.write(text.getBytes("UTF-8")); out.getFD().sync(); } finally { out.close(); }
        return tmp.renameTo(f);
      } catch (IOException e) {
        return false;
      }
    }
  }
}

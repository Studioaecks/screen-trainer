// Screen Trainer for Android — carrying on with the screen off.
//
// Android puts an app to sleep soon after its screen goes dark. The owner wants the team to keep training then
// (option "Train with the screen off"), so while that option is on and the app is open, this service runs: it shows
// one quiet notification ("training"), which is how Android lets an app stay awake, and holds the processor awake.
// It ends when the app is closed (swiped away from the recent apps), when the option is switched off, or from the
// notification's Stop button. It does nothing else: no network, no files.
package app.screentrainer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

public final class Keep extends Service {
  static final String STOP = "app.screentrainer.STOP";
  private static final String CHANNEL = "training";
  private static volatile boolean running;
  private PowerManager.WakeLock lock;

  static boolean isRunning() { return running; }

  /** start or stop the service; never throws (Android may refuse to start it from the background) */
  static void set(Context ctx, boolean on) {
    try {
      Intent i = new Intent(ctx, Keep.class);
      if (!on) { ctx.stopService(i); return; }
      if (running) return;
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
    } catch (RuntimeException e) { /* then the game simply waits while the screen is off */ }
  }

  @Override public void onCreate() {
    super.onCreate();
    running = true;
    try {
      PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), flags());
      PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, Keep.class).setAction(STOP), flags());
      Notification.Builder b;
      if (Build.VERSION.SDK_INT >= 26) {
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Training with the screen off", NotificationManager.IMPORTANCE_LOW);
        ch.setShowBadge(false);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        b = new Notification.Builder(this, CHANNEL);
      } else b = new Notification.Builder(this);
      b.setSmallIcon(getApplicationInfo().icon).setContentTitle("Screen Trainer").setContentText("Your team keeps training. Close the app to stop.")
          .setOngoing(true).setContentIntent(open).addAction(0, "Stop", stop);
      Notification n = b.build();
      if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, 2 /* ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK: the game's music and sounds */);
      else startForeground(1, n);
      PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
      lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "screentrainer:training");
      lock.setReferenceCounted(false);
      lock.acquire();
    } catch (RuntimeException e) {
      stopSelf();                                             // not allowed here: give up quietly
    }
  }

  private static int flags() { return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_UPDATE_CURRENT | 0x04000000 /* FLAG_IMMUTABLE */ : PendingIntent.FLAG_UPDATE_CURRENT; }

  @Override public int onStartCommand(Intent intent, int f, int id) {
    if (intent != null && STOP.equals(intent.getAction())) { Host.stoppedByUser = true; stopSelf(); }
    return START_NOT_STICKY;
  }

  /** the app was swiped away from the recent apps: that is "closing the app", and everything stops */
  @Override public void onTaskRemoved(Intent root) { stopSelf(); super.onTaskRemoved(root); }

  @Override public void onDestroy() {
    running = false;
    try { if (lock != null && lock.isHeld()) lock.release(); } catch (RuntimeException e) { /* already gone */ }
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}

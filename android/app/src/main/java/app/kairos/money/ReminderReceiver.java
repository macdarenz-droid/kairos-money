package app.kairos.money;

import android.app.*;
import android.content.*;

public class ReminderReceiver extends BroadcastReceiver {
 private static final int ID=250;
 private static PendingIntent alarm(Context c) {return PendingIntent.getBroadcast(c,ID,new Intent(c,ReminderReceiver.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 static void schedule(Context c,long at) {c.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,alarm(c));}
 static void cancel(Context c) {c.getSystemService(AlarmManager.class).cancel(alarm(c));c.getSystemService(NotificationManager.class).cancel(ID);}
 @Override public void onReceive(Context c,Intent intent) {
  NotificationManager manager=c.getSystemService(NotificationManager.class);
  if(!manager.areNotificationsEnabled())return;
  if(android.os.Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
  manager.createNotificationChannel(new NotificationChannel("account-updates","Account updates",NotificationManager.IMPORTANCE_DEFAULT));
  PendingIntent open=PendingIntent.getActivity(c,ID,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  manager.notify(ID,new Notification.Builder(c,"account-updates").setSmallIcon(R.drawable.kairos_mark).setContentTitle("Update accounts").setContentText("Open Kairos to review your next bank export.").setContentIntent(open).setAutoCancel(true).build());
  schedule(c,System.currentTimeMillis()+7L*86400000L);
 }
}

package app.kairos.money;

import android.app.*;
import android.content.*;
import org.json.*;

/** Alarm payloads contain generic kind, opaque event hash and time only. */
public class MoneyNoticeReceiver extends BroadcastReceiver {
 static final String PREFS="money-notices";
 private static PendingIntent alarm(Context c,int slot){return PendingIntent.getBroadcast(c,300+slot,new Intent(c,MoneyNoticeReceiver.class).putExtra("slot",slot),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 static void replace(Context c,JSONArray queue)throws JSONException {
  if(queue.length()>4)throw new IllegalArgumentException("At most four money notices can be queued.");
  long now=System.currentTimeMillis();
  for(int i=0;i<queue.length();i++){JSONObject item=queue.getJSONObject(i);String kind=item.getString("kind");if(!java.util.Arrays.asList("bill","unusual","price","digest").contains(kind)||!item.getString("key").matches("[a-f0-9]{64}")||item.getLong("at")<=now||item.getLong("at")>now+16L*86400000L)throw new IllegalArgumentException("Invalid local notification schedule.");}
  AlarmManager alarms=c.getSystemService(AlarmManager.class);
  for(int i=0;i<4;i++){alarms.cancel(alarm(c,i));c.getSystemService(NotificationManager.class).cancel(300+i);}
  c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString("queue",queue.toString()).apply();
  for(int i=0;i<queue.length();i++)alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,queue.getJSONObject(i).getLong("at"),alarm(c,i));
 }
 @Override public void onReceive(Context c,Intent intent){
  try{
   SharedPreferences prefs=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);JSONArray queue=new JSONArray(prefs.getString("queue","[]"));int slot=intent.getIntExtra("slot",-1);if(slot<0||slot>=queue.length())return;
   JSONObject item=queue.getJSONObject(slot);long now=System.currentTimeMillis(),at=item.getLong("at");String key=item.getString("key");
   if(now<at||now-at>86400000L||now-prefs.getLong("last",0)<86400000L)return;
   java.util.Set<String> sent=new java.util.HashSet<>(prefs.getStringSet("sent",java.util.Collections.emptySet()));if(sent.contains(key))return;
   NotificationManager manager=c.getSystemService(NotificationManager.class);if(!manager.areNotificationsEnabled())return;
   if(android.os.Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
   String kind=item.getString("kind"),title=kind.equals("bill")?"Upcoming bill":kind.equals("price")?"Review a recurring payment":kind.equals("digest")?"Monthly money review":"Review a recorded transaction";
   String channel="money-"+kind;manager.createNotificationChannel(new NotificationChannel(channel,title,NotificationManager.IMPORTANCE_DEFAULT));
   PendingIntent open=PendingIntent.getActivity(c,300+slot,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
   manager.notify(300+slot,new Notification.Builder(c,channel).setSmallIcon(R.drawable.kairos_mark).setContentTitle(title).setContentText("Unlock Kairos to review your imported data.").setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true).build());
   if(sent.size()>=128)sent.clear();sent.add(key);prefs.edit().putLong("last",now).putStringSet("sent",sent).apply();
  }catch(JSONException ignored){ /* Invalid or cleared queue cannot produce a notification. */ }
 }
}

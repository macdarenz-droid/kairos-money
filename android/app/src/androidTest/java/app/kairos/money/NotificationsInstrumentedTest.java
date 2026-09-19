package app.kairos.money;

import static org.junit.Assert.*;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.ParcelFileDescriptor;
import android.service.notification.StatusBarNotification;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Actual Android broadcast and NotificationManager boundaries on the fresh gate emulator. */
public class NotificationsInstrumentedTest {
    private final Context target=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final SharedPreferences prefs=target.getSharedPreferences(MoneyNoticeReceiver.PREFS,Context.MODE_PRIVATE);
    private final NotificationManager manager=target.getSystemService(NotificationManager.class);
    private JSONObject item(String kind,char key,long at) throws Exception {
        return new JSONObject().put("kind",kind).put("key",String.join("",Collections.nCopies(64,String.valueOf(key)))).put("at",at);
    }
    private void deliver(int slot) throws Exception {
        target.sendBroadcast(new Intent(target,MoneyNoticeReceiver.class).putExtra("slot",slot));
        // Synchronize actual system dispatch, including negative assertions. No receiver method is called directly.
        try(InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("am wait-for-broadcast-idle"))) {
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] block=new byte[4096];int count;
            while((count=input.read(block))!=-1)bytes.write(block,0,count);
            assertTrue("Android broadcasts did not drain",bytes.toString("UTF-8").contains("All broadcast queues are idle"));
        }
    }
    private void queue(JSONArray queue) {assertTrue(prefs.edit().putString("queue",queue.toString()).commit());}
    private StatusBarNotification notice(int id) {
        for(StatusBarNotification value:manager.getActiveNotifications())if(value.getId()==id)return value;
        return null;
    }
    private void noNotices(){for(int id=300;id<304;id++)assertNull("Unexpected money notification "+id,notice(id));}
    @Test public void nativeDeliveryHonoursPermissionCapsPrivacyAndCancellation() throws Exception {
        assertEquals("Fresh gate keeps money notices disabled", "[]",prefs.getString("queue","[]"));
        assertEquals("Permission-denied path must actually be exercised before grant",PackageManager.PERMISSION_DENIED,target.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS));
        JSONArray evidence=new JSONArray();
        try {
            MoneyNoticeReceiver.replace(target,new JSONArray());noNotices();
            queue(new JSONArray().put(item("bill",'a',System.currentTimeMillis()-1000)));
            deliver(0);noNotices();assertEquals(0,prefs.getLong("last",0));
            InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(target.getPackageName(),Manifest.permission.POST_NOTIFICATIONS);
            String[] kinds={"bill","unusual","price","digest"};
            String[] titles={"Upcoming bill","Review a recorded transaction","Review a recurring payment","Monthly money review"};
            for(int i=0;i<kinds.length;i++) {
                // Schedule a real future AlarmManager queue, then model its due time explicitly.
                // This proves dispatch/delivery policy, not wall-clock or Doze punctuality.
                MoneyNoticeReceiver.replace(target,new JSONArray().put(item(kinds[i],(char)('a'+i),System.currentTimeMillis()+600000)));
                assertEquals(1,new JSONArray(prefs.getString("queue","[]")).length());
                queue(new JSONArray().put(item(kinds[i],(char)('a'+i),System.currentTimeMillis()-1000)));
                prefs.edit().putLong("last",0).putStringSet("sent",Collections.emptySet()).commit();
                deliver(0);
                long deadline=System.currentTimeMillis()+5000;
                StatusBarNotification shown=notice(300);
                while(shown==null&&System.currentTimeMillis()<deadline){Thread.sleep(50);shown=notice(300);}
                assertNotNull("Due native notice missing: "+kinds[i],shown);
                Notification n=shown.getNotification();
                assertEquals(titles[i],n.extras.getString(Notification.EXTRA_TITLE));
                assertEquals("Unlock Kairos to review your imported data.",n.extras.getString(Notification.EXTRA_TEXT));
                assertEquals(Notification.VISIBILITY_PRIVATE,n.visibility);assertNotNull(n.contentIntent);
                assertEquals("money-"+kinds[i],n.getChannelId());
                assertEquals(Collections.singleton(item(kinds[i],(char)('a'+i),1).getString("key")),prefs.getStringSet("sent",Collections.emptySet()));
                // Another due event is capped during the same day.
                MoneyNoticeReceiver.replace(target,new JSONArray());
                deadline=System.currentTimeMillis()+5000;
                while(notice(300)!=null&&System.currentTimeMillis()<deadline)Thread.sleep(50);
                noNotices();
                queue(new JSONArray().put(item(kinds[i],'e',System.currentTimeMillis()-1000)));
                deliver(0);noNotices();
                // The same event remains deduplicated after the daily cap expires.
                prefs.edit().putLong("last",0).commit();
                queue(new JSONArray().put(item(kinds[i],(char)('a'+i),System.currentTimeMillis()-1000)));
                deliver(0);noNotices();
                evidence.put(new JSONObject().put("kind",kinds[i]).put("delivered",true).put("generic_private_content",true).put("daily_cap",true).put("deduplicated",true));
            }
            prefs.edit().putLong("last",0).putStringSet("sent",Collections.emptySet()).commit();
            queue(new JSONArray().put(item("bill",'f',System.currentTimeMillis()+600000)));deliver(0);noNotices();
            queue(new JSONArray().put(item("bill",'f',System.currentTimeMillis()-2L*86400000)));deliver(0);noNotices();
            MoneyNoticeReceiver.replace(target,new JSONArray());deliver(0);noNotices();
            assertEquals("[]",prefs.getString("queue","missing"));
            File directory=new File(target.getExternalFilesDir(null),"evidence");assertTrue(directory.exists()||directory.mkdirs());
            Files.write(new File(directory,"native-notifications.json").toPath(),new JSONObject().put("kinds",evidence).put("denied_permission_suppresses_delivery",true).put("future_and_stale_events_suppressed",true).put("queue_cancellation",true).put("scope","Production receiver through Android broadcast and actual NotificationManager. Due-time fixture; real Doze/alarm delivery timing remains unmeasured.").toString(2).getBytes(StandardCharsets.UTF_8));
        } finally {
            MoneyNoticeReceiver.replace(target,new JSONArray());prefs.edit().clear().commit();
        }
    }
}

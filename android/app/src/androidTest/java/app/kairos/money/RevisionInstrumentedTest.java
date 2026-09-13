package app.kairos.money;

import static org.junit.Assert.*;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.provider.MediaStore;
import android.graphics.Rect;
import android.os.SystemClock;
import android.util.Base64;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class RevisionInstrumentedTest {
    private MainActivity activity;
    private final Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private String js(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView did not respond", latch.await(15, TimeUnit.SECONDS)); return result.get();
    }
    private void awaitJs(String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 60000;
        while (System.currentTimeMillis() < deadline) { if ("true".equals(js(condition))) return; Thread.sleep(150); }
        fail("Import UI condition failed: " + condition + "; page: " + js("document.body.innerText"));
    }
    private void click(String name) throws Exception {
        String button = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + JSONObject.quote(name) + ")";
        awaitJs("Boolean(" + button + ")"); js(button + ".click()");
    }
    private void input(String label, String value) throws Exception {
        String script = "(()=>{const l=Array.from(document.querySelectorAll('label')).find(x=>x.textContent.startsWith(" + JSONObject.quote(label) + "));const i=l.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i," + JSONObject.quote(value) + ");i.dispatchEvent(new Event('input',{bubbles:true}));})()";
        js(script);
    }
    private void unlock() throws Exception { awaitJs("document.body.innerText.includes('Welcome back')"); input("PIN", "246810"); click("Unlock"); awaitJs("Boolean(document.querySelector('nav'))"); }
    private byte[] asset(String name) throws Exception {
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name); ByteArrayOutputStream output = new ByteArrayOutputStream()) { byte[] block = new byte[8192]; int n; while ((n = input.read(block)) != -1) output.write(block, 0, n); return output.toByteArray(); }
    }
    private void evidence(String name, String content) throws Exception {
        File directory = new File(activity.getExternalFilesDir(null), "evidence");
        assertTrue(directory.exists() || directory.mkdirs());
        try (FileOutputStream output = new FileOutputStream(new File(directory, name))) { output.write(content.getBytes(StandardCharsets.UTF_8)); }
    }
    private String hierarchy(AccessibilityNodeInfo node) {
        if (node == null) return "No active window\n";
        StringBuilder result = new StringBuilder().append(node.getPackageName()).append(" | ").append(node.getClassName()).append(" | ").append(node.getText()).append(" | ").append(node.getContentDescription()).append(" | clickable=").append(node.isClickable()).append(" | id=").append(node.getViewIdResourceName()).append('\n');
        for (int i = 0; i < node.getChildCount(); i++) result.append(hierarchy(node.getChild(i)));
        return result.toString();
    }
    private boolean clickDocument(AccessibilityNodeInfo node, String name) {
        if (node == null) return false;
        CharSequence text = node.getText(); CharSequence description = node.getContentDescription();
        if ((text != null && text.toString().equals(name)) || (description != null && description.toString().equals(name))) {
            if (!node.isVisibleToUser() || !node.isEnabled()) return false;
            AccessibilityNodeInfo action = node;
            while (action != null) {
                if (action.isClickable() && action.isEnabled() && action.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                action = action.getParent();
            }
            Rect bounds = new Rect(); node.getBoundsInScreen(bounds); if (bounds.isEmpty()) return false;
            long time = SystemClock.uptimeMillis();
            MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, bounds.centerX(), bounds.centerY(), 0);
            MotionEvent up = MotionEvent.obtain(time, time + 50, MotionEvent.ACTION_UP, bounds.centerX(), bounds.centerY(), 0);
            down.setSource(InputDevice.SOURCE_TOUCHSCREEN); up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try {
                boolean pressed = InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(down, true);
                return InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(up, true) && pressed;
            } finally { down.recycle(); up.recycle(); }
        }
        for (int i = 0; i < node.getChildCount(); i++) if (clickDocument(node.getChild(i), name)) return true;
        return false;
    }

    private void choose(String name) throws Exception {
        click("Import statements");
        try { InstrumentationRegistry.getInstrumentation().getUiAutomation().waitForIdle(1000,10000); } catch(java.util.concurrent.TimeoutException ignored) {}
        long deadline=System.currentTimeMillis()+30000; boolean picked=false;
        while(System.currentTimeMillis()<deadline) {
            AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(picked && root!=null && "app.kairos.money".contentEquals(root.getPackageName())) return;
            if(!clickDocument(root,"Open") && !clickDocument(root,"OPEN")) picked=clickDocument(root,name)||picked;
            Thread.sleep(300);
        }
        evidence("revision-picker.txt",hierarchy(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow()));
        fail("Revision file picker did not return");
    }
    private Uri download(String name,String csv) throws Exception {
        ContentValues values=new ContentValues(); values.put(MediaStore.Downloads.DISPLAY_NAME,name);values.put(MediaStore.Downloads.MIME_TYPE,"text/csv");values.put(MediaStore.Downloads.RELATIVE_PATH,"Download");
        Uri uri=target.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);assertNotNull(uri);
        try(OutputStream out=target.getContentResolver().openOutputStream(uri)){assertNotNull(out);out.write(csv.getBytes(StandardCharsets.UTF_8));}return uri;
    }
    @Test public void a_exportMappingFreshnessAndResultsInBothThemes() throws Exception {
        java.time.LocalDate today=java.time.LocalDate.now(),end=today.minusDays(9),start=end.minusDays(7);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();
            for(String theme:new String[]{"Light","Dark"}) {
                String prefix=theme.toLowerCase(),name="Kairos-weekly-"+prefix+".csv";
                Uri uri=download(name,"Date,Description,Amount\n"+end+",Synthetic revision "+prefix+",-12.00\n");
                try {
                    click("You");click(theme);click("Ledger");choose(name);
                    awaitJs("document.body.innerText.includes('Files waiting for review')");click("Read file");
                    input("Statement start",start.toString());input("Statement end",end.toString());click("Extract for review");
                    awaitJs("Boolean(document.querySelector('dialog')?.innerText.includes('Tier C')) && Boolean(Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Confirm import' && !b.disabled))");
                    NativeEvidence.capture(activity,prefix+"-revision-tier-c");click("Confirm import");
                    awaitJs("!document.querySelector('dialog') && document.body.innerText.includes('Added 1 new transaction')");
                    NativeEvidence.capture(activity,prefix+"-revision-result");click("Today");
                    awaitJs("document.body.innerText.includes('9 days old') && Boolean(document.querySelector('.surface-muted'))");
                    NativeEvidence.capture(activity,prefix+"-revision-stale");click("Update accounts");
                    awaitJs("Boolean(document.querySelector('dialog')) && document.body.innerText.includes('Export ')");
                    String range=js("document.querySelector('.export-range').textContent");
                    assertTrue(range.contains(String.valueOf(end.minusDays(6).getDayOfMonth())));
                    NativeEvidence.capture(activity,prefix+"-revision-update");
                    js("document.querySelector('dialog .icon-button').click()");click("Ledger");
                } finally { target.getContentResolver().delete(uri,null,null); }
                String ambiguous="Kairos-ambiguous-"+prefix+".csv";
                Uri mappingUri=download(ambiguous,(theme.equals("Dark")?"Transaction date,Details,Amount\n":"Date,Description,Amount\n")+"03/04/2026,Synthetic mapping "+prefix+",-4.00\n");
                try {
                    choose(ambiguous);awaitJs("document.body.innerText.includes('Files waiting for review')");click("Read file");
                    input("Statement start","2026-03-01");input("Statement end","2026-04-30");click("Extract for review");
                    awaitJs("document.body.innerText.includes('Map export columns')");
                    js("document.querySelector('.data-grid-scroll').scrollIntoView()");
                    NativeEvidence.capture(activity,prefix+"-revision-mapping");click("Use mapping and read");
                    awaitJs("document.body.innerText.includes('Tier C') && document.body.innerText.includes('Confirm import')");click("Discard import");
                    awaitJs("!document.querySelector('dialog')");
                } finally { target.getContentResolver().delete(mappingUri,null,null); }
                String dropScript="(()=>{const transfer=new DataTransfer();for(let i=1;i<=2;i++)transfer.items.add(new File(['Date,Description,Amount\\n"+end+",Synthetic grouped "+prefix+" '+i+',-'+i+'.00\\n'],['group-"+prefix+"-'+i+'.csv'].join(''),{type:'text/csv'}));document.querySelector('.import-workspace').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));})()";
                js(dropScript);awaitJs("document.body.innerText.includes('2 files staged in one update')");
                for(int i=0;i<2;i++) {
                    click("Read file");input("Statement start",start.toString());input("Statement end",end.toString());click("Extract for review");
                    awaitJs("document.body.innerText.includes('Tier C') && Boolean(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirm import'))");
                    js("document.querySelector('dialog .icon-button').click()");awaitJs("!document.querySelector('dialog')");
                }
                click("Review update");awaitJs("Boolean(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirm update' && !b.disabled))");
                NativeEvidence.capture(activity,prefix+"-revision-multi-review");click("Confirm update");
                awaitJs("!document.querySelector('dialog') && document.body.innerText.includes('Added 2 new transactions')");

            }
        }
    }
    @Test public void b_localReminderDeliversAndCancelsWithoutNetwork() throws Exception {
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(target.getPackageName(),android.Manifest.permission.POST_NOTIFICATIONS);
        try {
            android.app.NotificationManager manager=target.getSystemService(android.app.NotificationManager.class);
            assertTrue("Notification permission was not enabled",manager.areNotificationsEnabled());
            new ReminderReceiver().onReceive(target,new android.content.Intent(target,ReminderReceiver.class));
            // NotificationManager enqueues asynchronously. Observe the actual
            // notification before the finally block can cancel its queued post.
            long deadline=SystemClock.uptimeMillis()+10000;
            android.service.notification.StatusBarNotification delivered=null;
            while(SystemClock.uptimeMillis()<deadline && delivered==null) {
                for(android.service.notification.StatusBarNotification notification:manager.getActiveNotifications())
                    if(notification.getId()==250 && "account-updates".equals(notification.getNotification().getChannelId()))delivered=notification;
                if(delivered==null)SystemClock.sleep(100);
            }
            assertNotNull("Kairos account-update notification did not become active within 10 seconds",delivered);
            assertEquals("Update accounts",delivered.getNotification().extras.getString(android.app.Notification.EXTRA_TITLE));
            ReminderReceiver.cancel(target);
            deadline=SystemClock.uptimeMillis()+10000;
            while(SystemClock.uptimeMillis()<deadline && manager.getActiveNotifications().length>0)SystemClock.sleep(100);
            assertEquals(0,manager.getActiveNotifications().length);
        } finally { ReminderReceiver.cancel(target); }
    }
}

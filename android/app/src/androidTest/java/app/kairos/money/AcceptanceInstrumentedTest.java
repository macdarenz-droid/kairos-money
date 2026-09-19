package app.kairos.money;

import static org.junit.Assert.*;
import android.app.UiAutomation;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipEntry;

/** Continues the real synthetic ledger created by FoundationInstrumentedTest. */
@RunWith(AndroidJUnit4.class)
public class AcceptanceInstrumentedTest {
    private MainActivity activity;
    private String js(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView did not respond", latch.await(15, TimeUnit.SECONDS)); return result.get();
    }
    private void awaitJs(String condition) throws Exception {
        long end = System.currentTimeMillis() + 45000;
        while (System.currentTimeMillis() < end) { if ("true".equals(js(condition))) return; Thread.sleep(150); }
        fail("Condition not met: " + condition + "; page: " + js("document.body.innerText"));
    }
    private void click(String text) throws Exception {
        String button = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + JSONObject.quote(text) + ")";
        awaitJs("Boolean(" + button + ")"); js(button + ".click()");
    }
    private void pin(String value) throws Exception {
        js("(()=>{const i=document.querySelector('input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i," + JSONObject.quote(value) + ");i.dispatchEvent(new Event('input',{bubbles:true}));})()");
        click("Unlock");
    }
    private void unlock() throws Exception { awaitJs("document.body.innerText.includes('Welcome back')"); pin("246810"); awaitJs("Boolean(document.querySelector('nav'))"); }
    private void screenshot(String name) throws Exception { NativeEvidence.capture(activity, name); }
    private boolean clickSave(AccessibilityNodeInfo node) {
        if (node == null) return false;
        CharSequence label = node.getText(); CharSequence pkg = node.getPackageName();
        if (pkg != null && pkg.toString().endsWith("documentsui") && label != null && label.toString().equalsIgnoreCase("Save") && node.isEnabled() && node.isClickable())
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        for (int i = 0; i < node.getChildCount(); i++) if (clickSave(node.getChild(i))) return true;
        return false;
    }
    private byte[] shellBytes(String command) throws Exception {
        ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
        try (FileInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] block = new byte[8192]; int count; while ((count = input.read(block)) != -1) output.write(block, 0, count); return output.toByteArray();
        }
    }
    private void verifyExport() throws Exception {
        byte[] bytes = shellBytes("cat /sdcard/Download/Kairos-money-export.zip");
        assertTrue("Expected a ZIP saved by the actual Android document picker", bytes.length > 4 && bytes[0] == 'P' && bytes[1] == 'K');
        JSONObject json = null; String accounts = null; int csvCount = 0;
        try (ZipInputStream zip = new ZipInputStream(new java.io.ByteArrayInputStream(bytes))) {
            ZipEntry entry; byte[] block = new byte[4096];
            while ((entry = zip.getNextEntry()) != null) {
                ByteArrayOutputStream output = new ByteArrayOutputStream(); int count;
                while ((count = zip.read(block)) != -1) output.write(block, 0, count);
                String content = output.toString(StandardCharsets.UTF_8.name());
                if (entry.getName().equals("kairos-money.json")) json = new JSONObject(content);
                if (entry.getName().equals("accounts.csv")) accounts = content;
                if (entry.getName().endsWith(".csv")) csvCount++;
            }
        }
        assertNotNull("JSON missing from saved export", json); assertEquals(2, json.getInt("schema_version"));
        // One CSV per ledger table. Kept in step with tableNames by scripts/device-strings.mjs, because
        // this number lives in Java and the table list lives in TypeScript, and nothing else connects them.
        assertEquals(18, csvCount); assertNotNull(accounts); assertTrue(accounts.contains("Synthetic everyday")); assertTrue(accounts.contains("12345"));
        assertEquals(12345L, json.getJSONObject("tables").getJSONArray("accounts").getJSONObject(0).getLong("opening_balance_minor"));
        // This external file contains only this test's synthetic account; remove it after verification.
        shellBytes("rm /sdcard/Download/Kairos-money-export.zip");
    }
    private String widgetRequest() {
        AtomicReference<String> request=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->request.set(activity.pendingQuickAddRequest()));
        return request.get();
    }
    private void awaitWidgetRequest(boolean pending) throws Exception {
        long deadline=SystemClock.uptimeMillis()+15000;
        while ((widgetRequest()!=null)!=pending && SystemClock.uptimeMillis()<deadline) Thread.sleep(100);
        assertEquals("Widget request was not "+(pending?"retained":"acknowledged after display"),pending,widgetRequest()!=null);
    }
    /**
     * THE WIDGET OPENS THE SHEET, NOT THE APP. A tap on the hosted widget must bring up QuickAddActivity over
     * whatever is on screen, take an amount on its own keypad, write the outbox on Save and close — and the
     * app must never be asked to come forward. Then, unlocked, the app takes the entry into the ledger and
     * the outbox is empty again. Checked with the app unlocked and with it locked: the sheet does not care.
     */
    private void verifyWidgetLaunch(ActivityScenario<MainActivity> scenario,String theme,boolean locked) throws Exception {
        Intent originalIntent=new Intent(activity.getIntent());
        activity.getSharedPreferences(QuickAddStore.PREFS,android.content.Context.MODE_PRIVATE).edit().remove("pending").commit();
        AppWidgetManager manager=AppWidgetManager.getInstance(activity);AppWidgetHost host=new AppWidgetHost(activity,9420);int id=host.allocateAppWidgetId();AppWidgetHostView[] shown=new AppWidgetHostView[1];
        try {
            ComponentName provider=new ComponentName(activity,QuickAddWidget.class);
            assertTrue("The disposable gate did not grant widget-host binding",manager.bindAppWidgetIdIfAllowed(id,provider));
            new QuickAddWidget().onUpdate(activity,manager,new int[]{id});
            assertNotNull("Quick-add widget provider metadata is missing",manager.getAppWidgetInfo(id));
            CountDownLatch attached=new CountDownLatch(1);activity.runOnUiThread(()->{host.startListening();shown[0]=host.createView(activity,id,manager.getAppWidgetInfo(id));int height=Math.round(150*activity.getResources().getDisplayMetrics().density);activity.addContentView(shown[0],new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,height));attached.countDown();});
            assertTrue("Quick-add widget did not render",attached.await(15,TimeUnit.SECONDS));Thread.sleep(500);
            View add=shown[0].findViewById(R.id.widget_add);assertNotNull("Quick-add widget action is missing",add);assertEquals("Add transaction",String.valueOf(add.getContentDescription()));
            View chip=shown[0].findViewById(R.id.widget_chip_1);assertNotNull("Quick-add widget chips are missing",chip);assertEquals("Groceries",String.valueOf(((android.widget.TextView)chip).getText()));
            screenshot(theme+"-launcher-widget");
            int[] center=new int[2];boolean[] visible=new boolean[1];CountDownLatch located=new CountDownLatch(1);
            activity.runOnUiThread(()->{int[] location=new int[2];add.getLocationOnScreen(location);center[0]=location[0]+add.getWidth()/2;center[1]=location[1]+add.getHeight()/2;visible[0]=add.isShown()&&add.getWidth()>0&&add.getHeight()>0;located.countDown();});
            assertTrue("Quick-add widget action was not laid out",located.await(15,TimeUnit.SECONDS)&&visible[0]);
            long downTime=SystemClock.uptimeMillis();UiAutomation input=InstrumentationRegistry.getInstrumentation().getUiAutomation();
            MotionEvent down=MotionEvent.obtain(downTime,downTime,MotionEvent.ACTION_DOWN,center[0],center[1],0);down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            MotionEvent up=MotionEvent.obtain(downTime,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,center[0],center[1],0);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try {
                assertTrue("Android rejected the widget touch down",input.injectInputEvent(down,true));
                assertTrue("Android rejected the widget touch up",input.injectInputEvent(up,true));
            } finally {down.recycle();up.recycle();}
            QuickAddActivity sheet=awaitSheet();
            screenshot(theme+(locked?"-locked":"")+"-widget-sheet");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{for(int key:new int[]{R.id.qa_key_4,R.id.qa_key_dot,R.id.qa_key_5,R.id.qa_key_0})sheet.findViewById(key).performClick();});
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->assertEquals("4.50",String.valueOf(((android.widget.TextView)sheet.findViewById(R.id.qa_amount)).getText())));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->sheet.findViewById(R.id.qa_save).performClick());
            long closing=SystemClock.uptimeMillis()+15000;while(!sheet.isDestroyed()&&SystemClock.uptimeMillis()<closing)Thread.sleep(100);
            assertTrue("The sheet did not close after Save",sheet.isDestroyed());
            JSONArray held=QuickAddStore.pending(activity);assertEquals("The sheet did not write the outbox",1,held.length());
            assertEquals("4.50",held.getJSONObject(0).getString("amount"));assertEquals("spent",held.getJSONObject(0).getString("direction"));
            assertNull("The widget must not ask the app to open",widgetRequest());
            scenario.onActivity(a->assertTrue("Widget changed the activity launch identity",originalIntent.filterEquals(a.getIntent())));
            // Unlocked next, the app takes the entry into the ledger as a hand-recorded transaction and clears the outbox.
            scenario.recreate();scenario.onActivity(a->activity=a);unlock();
            awaitJs("document.body.innerText.includes('Recorded 1 transaction from the widget')");
            long emptied=SystemClock.uptimeMillis()+15000;while(QuickAddStore.pending(activity).length()>0&&SystemClock.uptimeMillis()<emptied)Thread.sleep(100);
            assertEquals("The outbox was not cleared once the ledger took the entry",0,QuickAddStore.pending(activity).length());
            assertEquals("Scenario missed the real activity resume",Lifecycle.State.RESUMED,scenario.getState());
            screenshot(theme+"-widget-recorded");
        } finally {InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{if(shown[0]!=null&&shown[0].getParent() instanceof ViewGroup)((ViewGroup)shown[0].getParent()).removeView(shown[0]);host.stopListening();host.deleteAppWidgetId(id);});}
    }
    private QuickAddActivity awaitSheet() throws Exception {
        long deadline=SystemClock.uptimeMillis()+15000;AtomicReference<QuickAddActivity> found=new AtomicReference<>();
        while(found.get()==null&&SystemClock.uptimeMillis()<deadline){
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{for(android.app.Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof QuickAddActivity)found.set((QuickAddActivity)a);});
            if(found.get()==null)Thread.sleep(100);
        }
        assertNotNull("The widget tap did not open the quick-add sheet over the screen",found.get());
        return found.get();
    }
    @Test public void launchResumeAndRealDocumentExport() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a -> activity = a);
            awaitJs("document.body.innerText.includes('Welcome back')");
            assertEquals("\"dark\"", js("document.documentElement.dataset.theme")); screenshot("dark-cold-launch-locked");
            pin("000000"); awaitJs("document.body.innerText.includes('That PIN did not match')");
            assertEquals("false", js("Boolean(document.querySelector('nav'))")); pin("246810"); awaitJs("Boolean(document.querySelector('nav'))");
            click("You"); click("Light"); awaitJs("document.documentElement.dataset.theme==='light'");
            scenario.recreate(); scenario.onActivity(a -> activity = a);
            awaitJs("document.body.innerText.includes('Welcome back')");
            assertEquals("\"light\"", js("document.documentElement.dataset.theme")); screenshot("light-recreated-locked"); unlock();
            scenario.moveToState(Lifecycle.State.CREATED); Thread.sleep(1000); scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(a -> activity = a); awaitJs("Boolean(document.querySelector('nav'))");
            scenario.moveToState(Lifecycle.State.CREATED); Thread.sleep(61000); scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(a -> activity = a); awaitJs("document.body.innerText.includes('Welcome back')");
            assertEquals("false", js("Boolean(document.querySelector('nav'))")); screenshot("light-resume-locked"); unlock();
            click("You"); click("Export all data"); click("Choose save location");
            UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
            long deadline = System.currentTimeMillis() + 30000; boolean saved = false;
            while (System.currentTimeMillis() < deadline && !saved) { saved = clickSave(automation.getRootInActiveWindow()); if (!saved) Thread.sleep(200); }
            if (!saved) NativeEvidence.captureSystem(activity, "document-picker-save-unavailable");
            assertTrue("The real document picker did not offer its Save action", saved);
            awaitJs("document.body.innerText.includes('Your JSON and CSV export was saved.')"); verifyExport();
            click("You"); click("Dark"); awaitJs("document.documentElement.dataset.theme==='dark'");verifyWidgetLaunch(scenario,"dark",false);
            // The widget check ends with the app recreated and unlocked, so it is back on Today.
            click("You");click("Light");awaitJs("document.documentElement.dataset.theme==='light'");click("Lock now");
            awaitJs("document.body.innerText.includes('Welcome back')");verifyWidgetLaunch(scenario,"light",true);
            // A displayed/acknowledged request must not replay on the next resume.
            scenario.moveToState(Lifecycle.State.CREATED);scenario.moveToState(Lifecycle.State.RESUMED);
            awaitJs("Boolean(document.querySelector('.app:not([aria-hidden=true]) nav')) && !document.querySelector('dialog[open]')");
            scenario.onActivity(a->{assertNull(a.pendingQuickAddRequest());});
            click("You");click("Dark");awaitJs("document.documentElement.dataset.theme==='dark'");
            // Preserve the original normal ActivityScenario teardown assertion.
        }
    }
}

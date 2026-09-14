package app.kairos.money;

import static org.junit.Assert.*;
import android.app.UiAutomation;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
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
        assertEquals(16, csvCount); assertNotNull(accounts); assertTrue(accounts.contains("Synthetic everyday")); assertTrue(accounts.contains("12345"));
        assertEquals(12345L, json.getJSONObject("tables").getJSONArray("accounts").getJSONObject(0).getLong("opening_balance_minor"));
        // This external file contains only this test's synthetic account; remove it after verification.
        shellBytes("rm /sdcard/Download/Kairos-money-export.zip");
    }
    private void verifyWidgetLaunch() throws Exception {
        AppWidgetManager manager=AppWidgetManager.getInstance(activity);AppWidgetHost host=new AppWidgetHost(activity,9420);int id=host.allocateAppWidgetId();AppWidgetHostView[] shown=new AppWidgetHostView[1];
        try {
            ComponentName provider=new ComponentName(activity,QuickAddWidget.class);
            assertTrue("The disposable gate did not grant widget-host binding",manager.bindAppWidgetIdIfAllowed(id,provider));
            new QuickAddWidget().onUpdate(activity,manager,new int[]{id});
            assertNotNull("Quick-add widget provider metadata is missing",manager.getAppWidgetInfo(id));
            CountDownLatch attached=new CountDownLatch(1);activity.runOnUiThread(()->{host.startListening();shown[0]=host.createView(activity,id,manager.getAppWidgetInfo(id));int height=Math.round(130*activity.getResources().getDisplayMetrics().density);activity.addContentView(shown[0],new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,height));attached.countDown();});
            assertTrue("Quick-add widget did not render",attached.await(15,TimeUnit.SECONDS));Thread.sleep(500);
            View add=shown[0].findViewById(R.id.widget_add);assertNotNull("Quick-add widget action is missing",add);assertEquals("Add transaction",String.valueOf(((android.widget.TextView)add).getText()));
            screenshot("dark-launcher-widget");
            int[] center=new int[2];boolean[] visible=new boolean[1];CountDownLatch located=new CountDownLatch(1);
            activity.runOnUiThread(()->{int[] location=new int[2];add.getLocationOnScreen(location);center[0]=location[0]+add.getWidth()/2;center[1]=location[1]+add.getHeight()/2;visible[0]=add.isShown()&&add.getWidth()>0&&add.getHeight()>0;located.countDown();});
            assertTrue("Quick-add widget action was not laid out",located.await(15,TimeUnit.SECONDS)&&visible[0]);
            long downTime=SystemClock.uptimeMillis();UiAutomation input=InstrumentationRegistry.getInstrumentation().getUiAutomation();
            MotionEvent down=MotionEvent.obtain(downTime,downTime,MotionEvent.ACTION_DOWN,center[0],center[1],0);down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            MotionEvent up=MotionEvent.obtain(downTime,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,center[0],center[1],0);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            assertTrue("Android rejected the widget touch down",input.injectInputEvent(down,true));
            assertTrue("Android rejected the widget touch up",input.injectInputEvent(up,true));down.recycle();up.recycle();
            awaitJs("Boolean(document.querySelector('dialog')) && document.body.innerText.includes('Add transaction')");screenshot("dark-widget-unlocked-entry");js("document.querySelector('dialog .icon-button').click()");
        } finally {activity.runOnUiThread(()->{if(shown[0]!=null&&shown[0].getParent() instanceof ViewGroup)((ViewGroup)shown[0].getParent()).removeView(shown[0]);host.stopListening();host.deleteAppWidgetId(id);});}
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
            click("You"); click("Dark"); awaitJs("document.documentElement.dataset.theme==='dark'");verifyWidgetLaunch();
            // The real widget PendingIntent has already proved the app route.
            // Finish the tracked task directly; asking ActivityScenario to resume
            // a PAUSED singleTask instance can deadlock its teardown bookkeeping.
            activity.runOnUiThread(activity::finishAndRemoveTask);
            long destroyDeadline=System.currentTimeMillis()+15000;
            while(!activity.isDestroyed()&&System.currentTimeMillis()<destroyDeadline)Thread.sleep(100);
            assertTrue("Tracked activity did not finish after the widget journey",activity.isDestroyed());
        }
    }
}

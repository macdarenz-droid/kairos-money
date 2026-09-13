package app.kairos.money;

import static org.junit.Assert.*;
import android.app.UiAutomation;
import android.graphics.Bitmap;
import android.os.ParcelFileDescriptor;
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
    private void screenshot(String name) throws Exception {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
        try {
            Thread.sleep(350); Bitmap shot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            File directory = new File(activity.getExternalFilesDir(null), "evidence"); assertTrue(directory.exists() || directory.mkdirs());
            try (FileOutputStream output = new FileOutputStream(new File(directory, name + ".png"))) { assertTrue(shot.compress(Bitmap.CompressFormat.PNG, 100, output)); }
            shot.recycle();
        } finally { InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE)); }
    }
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
            assertTrue("The real document picker did not offer its Save action", saved);
            awaitJs("document.body.innerText.includes('Your JSON and CSV export was saved.')"); verifyExport();
            click("You"); click("Dark"); awaitJs("document.documentElement.dataset.theme==='dark'");
        }
    }
}

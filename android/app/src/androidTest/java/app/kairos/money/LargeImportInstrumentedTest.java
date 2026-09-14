package app.kairos.money;

import static org.junit.Assert.*;

import android.content.ContentValues;
import android.content.Context;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;

public class LargeImportInstrumentedTest {
    private MainActivity activity;
    private final Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private String js(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value); latch.countDown();
        }));
        assertTrue("WebView did not respond", latch.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitJs(String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 60000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(js(condition))) return;
            Thread.sleep(150);
        }
        fail("Large-import UI condition failed: " + condition + "; page: " + js("document.body.innerText"));
    }

    private void click(String name) throws Exception {
        String button = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + JSONObject.quote(name) + ")";
        awaitJs("Boolean(" + button + ")");
        js(button + ".click()");
    }

    private void input(String label, String value) throws Exception {
        js("(()=>{const l=Array.from(document.querySelectorAll('label')).find(x=>x.textContent.startsWith(" + JSONObject.quote(label) + "));const i=l.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i," + JSONObject.quote(value) + ");i.dispatchEvent(new Event('input',{bubbles:true}));})()");
    }

    private void unlock() throws Exception {
        awaitJs("document.body.innerText.includes('Welcome back')");
        input("PIN", "246810"); click("Unlock"); awaitJs("Boolean(document.querySelector('nav'))");
    }

    private void evidence(String name, String content) throws Exception {
        File directory = new File(activity.getExternalFilesDir(null), "evidence");
        assertTrue(directory.exists() || directory.mkdirs());
        try (FileOutputStream output = new FileOutputStream(new File(directory, name))) {
            output.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }

    private boolean clickDocument(AccessibilityNodeInfo node, String name) {
        if (node == null) return false;
        CharSequence text = node.getText(), description = node.getContentDescription();
        if ((text != null && name.contentEquals(text)) || (description != null && name.contentEquals(description))) {
            if (!node.isVisibleToUser() || !node.isEnabled()) return false;
            for (AccessibilityNodeInfo action = node; action != null; action = action.getParent()) {
                if (action.isClickable() && action.isEnabled() && action.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            }
            Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
            if (bounds.isEmpty()) return false;
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

    private void chooseDownload(String name) throws Exception {
        try { InstrumentationRegistry.getInstrumentation().getUiAutomation().waitForIdle(1000, 10000); }
        catch (java.util.concurrent.TimeoutException ignored) { }
        long started = System.currentTimeMillis(), deadline = started + 30000;
        boolean chosen = false, drawerOpened = false, downloadsOpened = false;
        while (System.currentTimeMillis() < deadline && !chosen) {
            AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            chosen = clickDocument(root, name);
            if (!chosen && System.currentTimeMillis() - started > 3000) {
                if (!drawerOpened) drawerOpened = clickDocument(root, "Show roots");
                else if (!downloadsOpened) downloadsOpened = clickDocument(root, "Downloads");
            }
            if (!chosen) Thread.sleep(200);
        }
        assertTrue("Real Android file picker did not show " + name, chosen);
        deadline = System.currentTimeMillis() + 15000;
        while (System.currentTimeMillis() < deadline) {
            AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if (root != null && "app.kairos.money".contentEquals(root.getPackageName())) return;
            if (root != null && "com.android.documentsui".contentEquals(root.getPackageName())) {
                if (!clickDocument(root, "Open") && !clickDocument(root, "OPEN")) clickDocument(root, name);
            }
            Thread.sleep(200);
        }
        fail("Android file picker did not return after confirming the large PDF");
    }

    @Test public void fortyPagePdfUsesVisibleResponsiveProgressAfterRecreation() throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, "Kairos-synthetic-40-page.pdf");
        values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
        values.put(MediaStore.Downloads.RELATIVE_PATH, "Download");
        Uri uri = target.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        assertNotNull(uri);
        try {
            PdfDocument pdf = new PdfDocument(); Paint paint = new Paint(); paint.setTextSize(18);
            for (int page = 1; page <= 40; page++) {
                PdfDocument.Page current = pdf.startPage(new PdfDocument.PageInfo.Builder(595, 842, page).create());
                current.getCanvas().drawText("SYNTHETIC OFFLINE STATEMENT PAGE " + page, 40, 80, paint);
                current.getCanvas().drawText("01 Jan 2026 SYNTHETIC PURCHASE 1.00", 40, 120, paint);
                pdf.finishPage(current);
            }
            try (OutputStream out = target.getContentResolver().openOutputStream(uri)) {
                assertNotNull(out); pdf.writeTo(out);
            } finally { pdf.close(); }
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(a -> activity = a); unlock(); click("Ledger"); click("Import statements");
                chooseDownload("Kairos-synthetic-40-page.pdf");
                awaitJs("document.body.innerText.includes('Files waiting for review')");
                scenario.recreate(); scenario.onActivity(a -> activity = a); unlock(); click("Ledger");
                awaitJs("document.body.innerText.includes('Files waiting for review')");
                long started = SystemClock.elapsedRealtime(); click("Read file");
                awaitJs("Boolean(document.querySelector('.import-progress'))");
                assertEquals("true", js("(()=>{window.__largeImportResponsive='yes';return window.__largeImportResponsive==='yes'})()"));
                NativeEvidence.capture(activity, "forty-page-pdf-progress");
                awaitJs("!document.querySelector('.import-progress')");
                long elapsed = SystemClock.elapsedRealtime() - started;
                evidence("forty-page-pdf.json", new JSONObject().put("pages", 40).put("elapsed_ms", elapsed)
                    .put("ui_responsive", true).put("progress_visible", true).put("survived_activity_recreation", true).toString(2));
                click("Discard file"); awaitJs("!document.querySelector('dialog')");
            }
        } finally { target.getContentResolver().delete(uri, null, null); }
    }
}

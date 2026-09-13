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
public class ImportInstrumentedTest {
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
        StringBuilder result = new StringBuilder().append(node.getPackageName()).append(" | ").append(node.getClassName()).append(" | ").append(node.getText()).append(" | ").append(node.getContentDescription()).append('\n');
        for (int i = 0; i < node.getChildCount(); i++) result.append(hierarchy(node.getChild(i)));
        return result.toString();
    }
    @Test public void a_bundledOcrReadsAllFourSyntheticScansOffline() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a -> activity = a); unlock();
            for (String kind : new String[]{"checking", "savings", "credit", "payslip"}) {
                String encoded = Base64.encodeToString(asset("synthetic-" + kind + "-scan.png"), Base64.NO_WRAP);
                js("window.__ocrResult=null;window.__ocrError=null;window.Capacitor.registerPlugin(\"KairosText\").recognize({base64:" + JSONObject.quote(encoded) + "}).then(r=>window.__ocrResult=r).catch(e=>window.__ocrError=String(e));");
                awaitJs("Boolean(window.__ocrResult || window.__ocrError)");
                assertEquals("OCR bridge failed", "null", js("window.__ocrError"));
                String result = new JSONArray("[" + js("JSON.stringify(window.__ocrResult)") + "]").getString(0);
                evidence("ocr-" + kind + ".json", result);
                JSONArray items = new JSONObject(result).getJSONArray("items"); StringBuilder text = new StringBuilder();
                for (int i = 0; i < items.length(); i++) text.append(items.getJSONObject(i).getString("text")).append(' ');
                assertTrue("OCR missed synthetic marker for " + kind + ": " + text, text.toString().toUpperCase().contains("SYNTHETIC"));
                assertTrue("OCR missed money for " + kind, text.toString().contains(kind.equals("payslip") ? "1600.00" : "10.00"));
                js("delete window.__ocrResult;delete window.__ocrError;");
            }
        }
    }
    private boolean clickDocument(AccessibilityNodeInfo node, String name) {
        if (node == null) return false;
        CharSequence text = node.getText(); CharSequence description = node.getContentDescription();
        if ((text != null && text.toString().equals(name)) || (description != null && description.toString().equals(name))) {
            if (!node.isVisibleToUser() || !node.isEnabled()) return false;
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
    @Test public void b_realFilePickerStageReviewCommitAndRollback() throws Exception {
        ContentValues values = new ContentValues(); values.put(MediaStore.Downloads.DISPLAY_NAME, "Kairos-synthetic-import.csv"); values.put(MediaStore.Downloads.MIME_TYPE, "text/csv"); values.put(MediaStore.Downloads.RELATIVE_PATH, "Download");
        Uri uri = target.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values); assertNotNull(uri);
        try {
            try (OutputStream out = target.getContentResolver().openOutputStream(uri)) { assertNotNull(out); out.write(asset("synthetic-checking-1.csv")); }
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(a -> activity = a); unlock();
                for (String theme : new String[]{"Light", "Dark"}) {
                    String prefix = theme.toLowerCase();
                    click("You"); click(theme); awaitJs("document.documentElement.dataset.theme===" + JSONObject.quote(prefix)); click("Ledger"); click("Import statements");
                    long started = System.currentTimeMillis(); long deadline = started + 30000; boolean chosen = false; boolean drawerOpened = false; boolean downloadsOpened = false;
                    while (System.currentTimeMillis() < deadline && !chosen) {
                        AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
                        chosen = clickDocument(root, "Kairos-synthetic-import.csv");
                        if (!chosen && System.currentTimeMillis() - started > 3000) {
                            if (!drawerOpened) drawerOpened = clickDocument(root, "Show roots");
                            else if (!downloadsOpened) downloadsOpened = clickDocument(root, "Downloads");
                        }
                        if (!chosen) Thread.sleep(200);
                    }
                    if (!chosen) { evidence(prefix + "-picker-hierarchy.txt", hierarchy(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow())); NativeEvidence.captureSystem(activity, prefix + "-picker-failure"); }
                    assertTrue("Real Android file picker did not show the synthetic CSV", chosen);
                    awaitJs("document.body.innerText.includes('Files waiting for review')"); click("Read file");
                    NativeEvidence.capture(activity, prefix + "-import-details");
                    input("Statement start", "2026-01-01"); input("Statement end", "2026-01-31"); input("Stated opening balance", "0"); input("Stated closing balance", "-59.00"); click("Extract for review");
                    awaitJs("document.body.innerText.includes('3 new') && document.body.innerText.includes('Balance mismatch')");
                    NativeEvidence.capture(activity, prefix + "-import-quarantine");
                    js("document.querySelector('dialog details').open=true"); input("Closing balance (decimal dot)", "-60.00"); click("Save stated balances");
                    awaitJs("document.body.innerText.includes('Balance check passed')"); js("document.querySelector('dialog details').open=false;document.querySelector('dialog .transaction-row').click()");
                    awaitJs("document.body.innerText.includes('Check transaction')");
                    js("(()=>{const s=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith('Category')).querySelector('select');s.value='Groceries';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('dialog:last-of-type input[type=checkbox]').click();})()");
                    NativeEvidence.capture(activity, prefix + "-import-correction"); click("Confirm this row");
                    awaitJs("!document.body.innerText.includes('Check transaction')"); NativeEvidence.capture(activity, prefix + "-import-review"); click("Confirm import");
                    awaitJs("document.body.innerText.includes('3 transactions') && !document.querySelector('dialog')");
                    assertTrue(js("document.body.innerText").contains("SYNTHETIC MERCHANT A")); NativeEvidence.capture(activity, prefix + "-import-ledger");
                    js("document.querySelector('.coverage').scrollIntoView()"); NativeEvidence.capture(activity, prefix + "-import-coverage"); js("window.scrollTo(0,0)");
                    click("Roll back"); NativeEvidence.capture(activity, prefix + "-import-rollback"); click("Confirm rollback");
                    awaitJs("document.body.innerText.includes('No transactions yet') && !document.querySelector('dialog')");
                }
            }
        } finally { target.getContentResolver().delete(uri, null, null); }
    }
}

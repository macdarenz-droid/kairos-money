package app.kairos.money;

import static org.junit.Assert.*;
import android.graphics.Rect;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;

final class BackupTestUi {
    private final MainActivity activity;
    BackupTestUi(MainActivity activity) { this.activity = activity; }
    String js(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView did not respond", latch.await(15, TimeUnit.SECONDS)); return result.get();
    }
    void await(String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 60000;
        while (System.currentTimeMillis() < deadline) { if ("true".equals(js(condition))) return; Thread.sleep(150); }
        fail("Condition not met: " + condition + "; page: " + js("document.body.innerText"));
    }
    void click(String text) throws Exception {
        String button = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + JSONObject.quote(text) + ")";
        await("Boolean(" + button + ") && !" + button + ".disabled"); js(button + ".click()");
    }
    void input(String label, String value) throws Exception {
        js("(()=>{const l=Array.from(document.querySelectorAll('label')).find(x=>x.textContent.startsWith(" + JSONObject.quote(label) + "));const i=l.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i," + JSONObject.quote(value) + ");i.dispatchEvent(new Event('input',{bubbles:true}));})()");
    }
    String value(String label) throws Exception {
        String encoded = js("Array.from(document.querySelectorAll('label')).find(x=>x.textContent.startsWith(" + JSONObject.quote(label) + ")).querySelector('input').value");
        return new JSONArray("[" + encoded + "]").getString(0);
    }
    // Render the same production screen with each existing token set; do not alter
    // stored preferences or database contents during full-digest assertions.
    void captureBoth(String name) throws Exception {
        String previous = js("document.documentElement.dataset.theme");
        try {
            for (String theme : new String[]{"dark", "light"}) {
                js("document.documentElement.dataset.theme=" + JSONObject.quote(theme));
                await("document.documentElement.dataset.theme===" + JSONObject.quote(theme));
                NativeEvidence.capture(activity, theme + "-" + name);
            }
        } finally { js("document.documentElement.dataset.theme=" + previous); }
    }
    void ready() throws Exception {
        await("Boolean(document.querySelector('nav'))");
        // Navigation mounts before Today's brain read settles; wait for it so the screen is complete.
        await("document.querySelector('.screen-header h1')?.textContent !== 'Today' || Boolean(document.querySelector('[data-brain]'))");
    }
    void unlock(String pin) throws Exception { await("document.body.innerText.includes('Welcome back')"); input("PIN", pin); click("Unlock"); ready(); }
    void setup(String pin) throws Exception {
        await("document.body.innerText.includes('Your money.')"); input("Choose a PIN", pin); input("Confirm PIN", pin); click("Create private ledger");
        await("document.body.innerText.includes('Keep your recovery code')"); captureBoth("recovery-setup"); js("document.querySelector('input[type=checkbox]').click()");
        await("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Continue to ledger' && !b.disabled)"); click("Continue to ledger"); ready();
    }
    private boolean activate(AccessibilityNodeInfo node, String name) {
        if (node == null) return false; CharSequence text = node.getText(), description = node.getContentDescription();
        if ((text != null && text.toString().equalsIgnoreCase(name)) || (description != null && description.toString().equalsIgnoreCase(name))) {
            if (!node.isVisibleToUser() || !node.isEnabled()) return false; AccessibilityNodeInfo action = node;
            while (action != null) { if (action.isClickable() && action.isEnabled() && action.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true; action = action.getParent(); }
            Rect bounds = new Rect(); node.getBoundsInScreen(bounds); if (bounds.isEmpty()) return false; long now = SystemClock.uptimeMillis();
            MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, bounds.centerX(), bounds.centerY(), 0), up = MotionEvent.obtain(now, now + 50, MotionEvent.ACTION_UP, bounds.centerX(), bounds.centerY(), 0);
            down.setSource(InputDevice.SOURCE_TOUCHSCREEN); up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try { return InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(down, true) && InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(up, true); }
            finally { down.recycle(); up.recycle(); }
        }
        for (int i = 0; i < node.getChildCount(); i++) if (activate(node.getChild(i), name)) return true; return false;
    }
    void saveDocument() throws Exception {
        long deadline = System.currentTimeMillis() + 30000;
        while (System.currentTimeMillis() < deadline) { if (activate(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow(), "Save")) return; Thread.sleep(200); }
        fail("Android document picker did not expose Save.");
    }
    void chooseDocument(String name) throws Exception {
        long deadline = System.currentTimeMillis() + 30000; boolean selected = false;
        while (System.currentTimeMillis() < deadline) {
            AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if (root != null && "app.kairos.money".contentEquals(root.getPackageName()) && selected) return;
            if (!selected) selected = activate(root, name);
            else if (!activate(root, "Open")) activate(root, name);
            Thread.sleep(200);
        }
        fail("Android document picker did not return the selected backup.");
    }
    byte[] shell(String command) throws Exception {
        ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
        try (FileInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] block = new byte[8192]; int count; while ((count = input.read(block)) != -1) output.write(block, 0, count); return output.toByteArray();
        }
    }
    void writeExternal(String name, String value) throws Exception {
        if (android.os.Build.VERSION.SDK_INT < 31) throw new IllegalStateException("Backup gate requires Android 31 or later.");
        assertTrue("Invalid synthetic fixture filename", name.matches("kairos-test-[a-z-]+\\.txt"));
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        ParcelFileDescriptor[] streams = InstrumentationRegistry.getInstrumentation().getUiAutomation()
            .executeShellCommandRw("tee /sdcard/Download/" + name);
        try (FileInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(streams[0])) {
            try (java.io.OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(streams[1])) {
                output.write(bytes);
            }
            byte[] block = new byte[1024];
            while (input.read(block) != -1) { /* Drain tee before verifying the file. */ }
        }
        assertTrue("Synthetic acceptance file was not written exactly", java.util.Arrays.equals(bytes, shell("cat /sdcard/Download/" + name)));
    }
    String readExternal(String name) throws Exception { return new String(shell("cat /sdcard/Download/" + name), StandardCharsets.UTF_8).trim(); }
}

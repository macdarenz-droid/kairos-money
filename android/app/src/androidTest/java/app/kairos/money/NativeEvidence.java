package app.kairos.money;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Screen evidence from the synthetic test device, never a production capture path. */
final class NativeEvidence {
    private NativeEvidence() {}

    static void capture(MainActivity activity, String name) throws Exception {
        long deadline = System.currentTimeMillis() + 15000;
        boolean foreground = false;
        String observed = "no active accessibility window";
        while (System.currentTimeMillis() < deadline) {
            AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                observed = String.valueOf(root.getPackageName());
                foreground = activity.getPackageName().equals(observed);
                if (foreground) break;
            }
            Thread.sleep(150);
        }
        if (!foreground) {
            captureSystem(activity, name + "-obscured");
            fail("Cannot verify Kairos pixels while another window is active: " + observed);
        }
        CountDownLatch drawn = new CountDownLatch(1);
        activity.runOnUiThread(() -> activity.getBridge().getWebView().postVisualStateCallback(0,
            new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) { drawn.countDown(); }
            }));
        assertTrue("WebView did not complete the requested visual state", drawn.await(15, TimeUnit.SECONDS));
        captureSystem(activity, name);
    }

    static void captureSystem(MainActivity activity, String name) throws Exception {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
        try {
            Thread.sleep(500);
            Bitmap shot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            assertNotNull("Android did not return a screenshot", shot);
            File directory = new File(activity.getExternalFilesDir(null), "evidence");
            assertTrue(directory.exists() || directory.mkdirs());
            try (FileOutputStream output = new FileOutputStream(new File(directory, name + ".png"))) {
                assertTrue(shot.compress(Bitmap.CompressFormat.PNG, 100, output));
            }
            shot.recycle();
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE));
        }
    }
}

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

    @android.annotation.TargetApi(29)
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
        // Clearing the secure-window flag can replace its surface. Do so before waiting for paint.
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
        try {
            CountDownLatch committed = new CountDownLatch(1);
            activity.runOnUiThread(() -> {
                WebView webView = activity.getBridge().getWebView();
                assertTrue("Native evidence requires hardware-accelerated drawing", webView.isHardwareAccelerated());
                webView.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                    @Override public void onComplete(long requestId) {
                        // VisualStateCallback means ready for the NEXT draw, not already on screen.
                        webView.getViewTreeObserver().registerFrameCommitCallback(committed::countDown);
                        webView.invalidate();
                    }
                });
            });
            assertTrue("WebView did not commit the requested frame", committed.await(15, TimeUnit.SECONDS));
            writeScreenshot(activity, name);
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE));
        }
    }

    static void captureSystem(MainActivity activity, String name) throws Exception {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
        try {
            writeScreenshot(activity, name);
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE));
        }
    }

    private static void writeScreenshot(MainActivity activity, String name) throws Exception {
        Thread.sleep(500);
        Bitmap shot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("Android did not return a screenshot", shot);
        File directory = new File(activity.getExternalFilesDir(null), "evidence");
        assertTrue(directory.exists() || directory.mkdirs());
        try (FileOutputStream output = new FileOutputStream(new File(directory, name + ".png"))) {
            assertTrue(shot.compress(Bitmap.CompressFormat.PNG, 100, output));
        } finally { shot.recycle(); }
    }
}

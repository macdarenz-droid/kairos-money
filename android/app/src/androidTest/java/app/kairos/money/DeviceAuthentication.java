package app.kairos.money;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.platform.app.InstrumentationRegistry;

/** Enters only the disposable emulator's screen-lock credential, never an app PIN. */
final class DeviceAuthentication {
    private static long lastAttempt;
    private static AccessibilityNodeInfo editable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isEditable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) { AccessibilityNodeInfo found = editable(node.getChild(i)); if (found != null) return found; }
        return null;
    }
    static void completeIfShown() {
        AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !("com.android.settings".contentEquals(root.getPackageName()) || "com.android.systemui".contentEquals(root.getPackageName()))) return;
        AccessibilityNodeInfo entry = editable(root);
        if (entry == null || SystemClock.elapsedRealtime() - lastAttempt < 2000) return;
        lastAttempt = SystemClock.elapsedRealtime();
        entry.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle value = new Bundle(); value.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "739182");
        if (!entry.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, value)) return;
        long now = SystemClock.uptimeMillis();
        InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER, 0), true);
        InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER, 0), true);
    }
}

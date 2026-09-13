# 0007 — Require unobscured native visual evidence

Decision: run Session 1 device checks on the Android 34 AOSP image with 3 GiB guest RAM, and verify the active Android accessibility window belongs to Kairos before accepting an app screenshot. Wait for WebView visual state and the selected tab before capture.

Evidence: run 34745565390 passed both foundation tests, including real SQLCipher app-file checks. PIN retry, theme persistence and 1-second/61-second resume assertions also completed. Export then failed to find Save. Inspection revealed a System UI ANR dialog over every saved screen, so those images are rejected. JavaScript interaction behind an OS dialog did not prove visible behavior.

Alternatives: dismiss or suppress ANR dialogs, ignore the screenshots, or retain the Google image and retry. These would hide a broken test environment or repeat unnecessary service load. The app requires no Google services in Session 1. AOSP still exercises real WebView, SQLCipher, Keystore and the system document picker.

Consequences: screenshot capture fails on a foreign foreground window and saves an obscured diagnostic image. The original production security flags remain in force; only synthetic instrumentation capture temporarily clears FLAG_SECURE. The selected SDK image is present in the official system-image catalogue. Biometrics depend on available/enrolled device hardware; PIN remains the mandatory tested unlock path.

Validation: full local APK, instrumentation and lint build passes. CI and clean screenshot review remain required before the Session 1 gate closes.

## Frame presentation follow-up

Run 34746295447 passes the complete functional gate, including real export and zero-file deletion. Visual inspection still rejects two stale frames: light Insights shows Ledger, and initial Today shows the preceding opening state. Android's [VisualStateCallback](https://developer.android.com/reference/android/webkit/WebView.VisualStateCallback) signals readiness for a subsequent draw; it does not prove that frame has been presented. Clear the synthetic capture window flag before the wait, request a draw and require the [frame commit callback](https://developer.android.com/reference/android/view/ViewTreeObserver#registerFrameCommitCallback(java.lang.Runnable)) before capturing. The production APK is unchanged by this instrumentation repair.

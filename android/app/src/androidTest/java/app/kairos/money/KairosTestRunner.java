package app.kairos.money;

import android.os.Bundle;
import androidx.test.runner.AndroidJUnitRunner;

/** Test-only driver for the emulator's real Android credential confirmation. */
public final class KairosTestRunner extends AndroidJUnitRunner {
    private volatile boolean driving;
    private Thread credentialDriver;

    @Override public void onStart() {
        driving = true;
        credentialDriver = new Thread(() -> {
            while (driving) {
                try {
                    DeviceAuthentication.completeIfShown();
                    Thread.sleep(500);
                } catch (InterruptedException stopped) {
                    Thread.currentThread().interrupt();
                    return;
                } catch (IllegalStateException unavailableWindow) {
                    // Window transitions are retried; test assertions still enforce timeouts.
                    try { Thread.sleep(500); } catch (InterruptedException stopped) { return; }
                }
            }
        }, "emulator-credential-driver");
        credentialDriver.setDaemon(true);
        credentialDriver.start();
        super.onStart();
    }

    @Override public void finish(int resultCode, Bundle results) {
        driving = false;
        if (credentialDriver != null) credentialDriver.interrupt();
        super.finish(resultCode, results);
    }
}

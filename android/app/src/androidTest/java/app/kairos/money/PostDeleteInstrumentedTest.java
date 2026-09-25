package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs only after the external verifier has proved zero remaining app-owned files. */
@RunWith(AndroidJUnit4.class)
public class PostDeleteInstrumentedTest {
    @Test public void freshSetupAfterDeletion() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        java.security.KeyStore keys = java.security.KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        assertFalse("Authentication key survived reset", keys.containsAlias(AuthenticatedKey.ALIAS));
        assertFalse("Vault key survived reset", keys.containsAlias(VaultStore.KEY_ALIAS));
        assertFalse("PIN key survived reset", keys.containsAlias(UnlockKeys.PIN_ALIAS));
        assertFalse("Biometric key survived reset", keys.containsAlias(UnlockKeys.BIOMETRIC_ALIAS));
        assertFalse(new VaultStore(context).configured());
        assertFalse(context.getDatabasePath("kairos-moneySQLite.db").exists());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long end = System.currentTimeMillis() + 45000; boolean setup = false;
            while (System.currentTimeMillis() < end && !setup) {
                CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
                scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript("document.body.innerText.includes('Choose a PIN') && !document.querySelector('nav')", result -> { value.set(result); latch.countDown(); }));
                assertTrue(latch.await(15, TimeUnit.SECONDS)); setup = "true".equals(value.get()); if (!setup) Thread.sleep(150);
            }
            assertTrue("Deleted application did not return to fresh PIN setup", setup);
            assertFalse(new VaultStore(context).configured());
            assertFalse(context.getDatabasePath("kairos-moneySQLite.db").exists());
        }
    }
}

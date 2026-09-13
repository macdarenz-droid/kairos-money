package app.kairos.money;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import java.security.KeyStore;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Runs before foundation setup on the disposable gate emulator only. */
public class PinRecoveryInstrumentedTest {
    private Context context;
    private boolean ownsTestVault;
    @Before public void freshVault() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse("Recovery tests require an empty emulator", new VaultStore(context).configured());
        ownsTestVault = true;
    }
    @After public void clearTestVault() throws Exception {
        if (!ownsTestVault) return;
        context.deleteSharedPreferences(VaultStore.PREFS);
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null); keys.deleteEntry(VaultStore.KEY_ALIAS);
    }
    @Test public void replacementRequiresDeviceGrantAndRetainsDatabaseKey() throws Exception {
        VaultStore store = new VaultStore(context); store.setup("246810", "246810");
        String secret = store.secret(); store.lock();
        assertThrows(IllegalStateException.class, () -> store.replacePin("135790", "135790"));
        store.authorizePinReplacement();
        assertFalse(store.isUnlocked());
        assertThrows(IllegalStateException.class, store::secret);
        assertThrows(IllegalStateException.class, () -> store.unlock("246810"));
        assertThrows(IllegalArgumentException.class, () -> store.replacePin("135790", "135791"));
        store.replacePin("135790", "135790"); assertEquals(secret, store.secret());
        store.lock(); assertThrows(IllegalArgumentException.class, () -> store.unlock("246810"));
        store.unlock("135790"); assertEquals(secret, store.secret());
    }
    @Test public void restartRetainsBackoffAndReplacementRequirementButNotGrant() throws Exception {
        VaultStore store = new VaultStore(context); store.setup("246810", "246810"); store.lock();
        for (int i = 0; i < 5; i++) assertThrows(IllegalArgumentException.class, () -> store.unlock("111111"));
        VaultStore restarted = new VaultStore(context);
        assertThrows(IllegalStateException.class, () -> restarted.unlock("246810"));
        restarted.authorizePinReplacement();
        VaultStore interrupted = new VaultStore(context);
        assertThrows(IllegalStateException.class, () -> interrupted.replacePin("135790", "135790"));
        assertThrows(IllegalStateException.class, () -> interrupted.unlock("246810"));
        interrupted.authorizePinReplacement(); interrupted.replacePin("135790", "135790");
        assertTrue(interrupted.isUnlocked());
    }
}

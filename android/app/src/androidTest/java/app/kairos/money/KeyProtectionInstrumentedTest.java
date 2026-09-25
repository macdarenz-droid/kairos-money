package app.kairos.money;

import static org.junit.Assert.*;
import android.content.Context;
import android.security.keystore.KeyInfo;
import android.security.keystore.UserNotAuthenticatedException;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import androidx.test.platform.app.InstrumentationRegistry;
import java.security.KeyStore;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import net.sqlcipher.database.SQLiteDatabase;
import org.junit.Test;
import com.getcapacitor.community.database.sqlite.SQLite.UtilsSecret;

public class KeyProtectionInstrumentedTest {
    @Test public void pinAloneOpensTheDatabaseWhileTheRecoveryKeyStillNeedsAndroid() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        SecretKey key = (SecretKey) keys.getKey(AuthenticatedKey.ALIAS, null);
        assertNotNull(key); assertNull("Wrapping key must not be exportable", key.getEncoded());
        KeyInfo info = (KeyInfo) SecretKeyFactory.getInstance(key.getAlgorithm(), "AndroidKeyStore").getKeySpec(key, KeyInfo.class);
        assertTrue(info.isUserAuthenticationRequired()); assertEquals(256, info.getKeySize());
        assertEquals(60, info.getUserAuthenticationValidityDurationSeconds());
        android.content.SharedPreferences vault = EncryptedSharedPreferences.create(context, VaultStore.PREFS,
            new MasterKey.Builder(context, VaultStore.KEY_ALIAS).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        assertFalse("Legacy vault copy remains", vault.contains("dbSecret"));
        String wrapped = vault.getString("authenticatedDbSecret", null); assertNotNull(wrapped);
        android.content.SharedPreferences sqlite = EncryptedSharedPreferences.create(context, "sqlite_encrypted_shared_prefs",
            new MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        assertFalse("Legacy SQLite copy remains", sqlite.contains("secret"));
        UtilsSecret.clearSessionSecret(); assertEquals("", UtilsSecret.getPassphrase());
        assertThrows(IllegalStateException.class, () -> new UtilsSecret(context, sqlite).setPassphrase("must-not-persist"));
        assertFalse(sqlite.contains("secret"));
        Thread.sleep(61000);
        assertThrows(UserNotAuthenticatedException.class, () -> AuthenticatedKey.unwrap(context, wrapped));
        // ADR 0050: the PIN unwraps the database key itself, with no second Android prompt.
        SecretKey pinKey = (SecretKey) keys.getKey(UnlockKeys.PIN_ALIAS, null);
        assertNotNull(pinKey); assertNull("PIN wrapping key must not be exportable", pinKey.getEncoded());
        String pinWrapped = vault.getString("pinDbSecret", null); assertNotNull(pinWrapped);
        VaultStore store = new VaultStore(context);
        assertThrows(IllegalArgumentException.class, () -> store.unlock("000000")); assertFalse(store.isUnlocked());
        store.unlock("246810");
        String secret = store.protectedSecret(); assertFalse(secret.isEmpty()); assertFalse(pinWrapped.contains(secret));
        SQLiteDatabase.loadLibs(context);
        SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath("kairos-moneySQLite.db").getPath(), secret, null, SQLiteDatabase.OPEN_READONLY);
        try (android.database.Cursor rows = db.rawQuery("SELECT COUNT(*) FROM sqlite_master", null)) { assertTrue(rows.moveToFirst()); assertTrue(rows.getLong(0) > 0); }
        finally { db.close(); }
        assertThrows("The recovery key must still need Android authentication", UserNotAuthenticatedException.class, () -> AuthenticatedKey.unwrap(context, wrapped));
        store.lock(); assertThrows(IllegalStateException.class, store::secret);
    }
}

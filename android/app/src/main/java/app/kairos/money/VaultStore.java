package app.kairos.money;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.os.SystemClock;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import java.io.File;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** No PIN, PIN hash or database key is persisted in WebView storage. */
final class VaultStore {
    static final String PREFS = "kairos-vault";
    static final String KEY_ALIAS = "kairos.money.vault";
    private final Context context;
    private SharedPreferences prefs;
    private boolean unlocked;
    private long recoveryUntil;
    VaultStore(Context context) { this.context = context; }
    private synchronized SharedPreferences prefs() throws Exception {
        if (prefs == null) {
            MasterKey key = new MasterKey.Builder(context, KEY_ALIAS).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
            prefs = EncryptedSharedPreferences.create(context, PREFS, key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        }
        return prefs;
    }
    synchronized boolean configured() throws Exception {
        File file = new File(context.getApplicationInfo().dataDir, "shared_prefs/" + PREFS + ".xml");
        return (prefs != null || file.exists()) && prefs().contains("pinHash");
    }
    private static byte[] derive(String pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), salt, 210000, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }
    private static String encode(byte[] value) { return Base64.encodeToString(value, Base64.NO_WRAP); }
    synchronized void setup(String pin, String confirmation) throws Exception {
        if (configured()) throw new IllegalStateException("This device already has a PIN.");
        if (pin == null || !pin.matches("[0-9]{6,12}")) throw new IllegalArgumentException("Choose a PIN with 6 to 12 digits.");
        if (!pin.equals(confirmation)) throw new IllegalArgumentException("The PINs do not match.");
        byte[] salt = new byte[32]; byte[] secret = new byte[32];
        new SecureRandom().nextBytes(salt); new SecureRandom().nextBytes(secret);
        byte[] hash = derive(pin, salt);
        boolean saved = prefs().edit().putString("salt", encode(salt)).putString("pinHash", encode(hash))
            .putString("dbSecret", encode(secret)).putInt("attempts", 0).putBoolean("biometric", false).commit();
        Arrays.fill(hash, (byte) 0); Arrays.fill(secret, (byte) 0);
        if (!saved) throw new IllegalStateException("The PIN could not be saved. Free some device storage and try again.");
        unlocked = true;
    }
    synchronized void unlock(String pin) throws Exception {
        if (!configured()) throw new IllegalStateException("Set a PIN before opening the ledger.");
        if (prefs().getBoolean("pinReplacementRequired", false)) throw new IllegalStateException("Authenticate with your device and choose a new Kairos PIN first.");
        long now = System.currentTimeMillis();
        if (now < prefs().getLong("nextAttempt", 0) || now < prefs().getLong("lastAttempt", 0))
            throw new IllegalStateException("Please wait before trying your PIN again.");
        if (pin == null || !pin.matches("[0-9]{6,12}")) throw new IllegalArgumentException("Enter your 6 to 12 digit PIN.");
        byte[] candidate = derive(pin, Base64.decode(prefs().getString("salt", ""), Base64.NO_WRAP));
        byte[] expected = Base64.decode(prefs().getString("pinHash", ""), Base64.NO_WRAP);
        boolean match = MessageDigest.isEqual(candidate, expected);
        Arrays.fill(candidate, (byte) 0); Arrays.fill(expected, (byte) 0);
        if (!match) {
            int attempts = Math.min(20, prefs().getInt("attempts", 0) + 1);
            long delay = attempts < 5 ? 0 : Math.min(900000L, 30000L * (1L << Math.min(5, attempts - 5)));
            if (!prefs().edit().putInt("attempts", attempts).putLong("lastAttempt", now).putLong("nextAttempt", now + delay).commit())
                throw new IllegalStateException("Secure storage is unavailable. Restart Kairos before trying again.");
            throw new IllegalArgumentException(delay == 0 ? "That PIN did not match. Try again." : "Please wait before trying your PIN again.");
        }
        if (!prefs().edit().putInt("attempts", 0).putLong("nextAttempt", 0).putLong("lastAttempt", now).commit())
            throw new IllegalStateException("Secure storage is unavailable. Restart Kairos.");
        unlocked = true;
    }
    synchronized void requireUnlocked() { if (!unlocked) throw new IllegalStateException("Unlock Kairos to continue."); }
    synchronized boolean isUnlocked() { return unlocked; }
    synchronized void lock() { unlocked = false; recoveryUntil = 0; }
    synchronized boolean biometricEnabled() throws Exception { return configured() && prefs().getBoolean("biometric", false); }
    synchronized void setBiometric(boolean enabled) throws Exception {
        requireUnlocked();
        if (!prefs().edit().putBoolean("biometric", enabled).commit()) throw new IllegalStateException("Could not save biometric preference.");
    }
    synchronized void biometricUnlock() throws Exception {
        if (prefs().getBoolean("pinReplacementRequired", false)) throw new IllegalStateException("Choose a new Kairos PIN before unlocking.");
        if (!biometricEnabled()) throw new IllegalStateException("Biometric unlock is not enabled.");
        unlocked = true;
    }
    synchronized void authorizePinReplacement() throws Exception {
        if (!configured()) throw new IllegalStateException("Set up Kairos first.");
        unlocked = false;
        if (!prefs().edit().putBoolean("pinReplacementRequired", true).commit())
            throw new IllegalStateException("Could not save recovery state. Try device authentication again.");
        recoveryUntil = SystemClock.elapsedRealtime() + 300000;
    }
    synchronized void replacePin(String pin, String confirmation) throws Exception {
        if (recoveryUntil == 0 || SystemClock.elapsedRealtime() >= recoveryUntil)
            throw new IllegalStateException("Authenticate with your device again before replacing your PIN.");
        if (pin == null || !pin.matches("[0-9]{6,12}")) throw new IllegalArgumentException("Choose a PIN with 6 to 12 digits.");
        if (!pin.equals(confirmation)) throw new IllegalArgumentException("The PINs do not match.");
        byte[] salt = new byte[32]; new SecureRandom().nextBytes(salt);
        byte[] hash = derive(pin, salt);
        try {
            if (!prefs().edit().putString("salt", encode(salt)).putString("pinHash", encode(hash))
                .putBoolean("pinReplacementRequired", false).putInt("attempts", 0)
                .putLong("nextAttempt", 0).putLong("lastAttempt", 0).commit())
                throw new IllegalStateException("The new PIN could not be saved. Free device storage and try again.");
        } finally { Arrays.fill(hash, (byte) 0); }
        recoveryUntil = 0; unlocked = true;
    }
    synchronized String secret() throws Exception { requireUnlocked(); return prefs().getString("dbSecret", ""); }
}

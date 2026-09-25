package app.kairos.money;

import android.content.Context;
import com.getcapacitor.community.database.sqlite.SQLite.UtilsSecret;
import android.content.SharedPreferences;
import android.util.Base64;
import android.os.SystemClock;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import java.io.File;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
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
    // The database key while unlocked, and what a PIN unlock or a recovery holds until it can be saved.
    private String sessionSecret, recoverySecret;
    private byte[] pendingPinKey, pendingPinSalt;
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
        byte[] hash = derive(pin, salt); String encoded = encode(secret); byte[] wrapSalt = PinWrap.salt();
        boolean saved = prefs().edit().putString("salt", encode(salt)).putString("pinHash", encode(hash))
            .putString("dbSecret", encoded).putString("pinWrapSalt", encode(wrapSalt)).putString("pinDbSecret", pinWrap(pin, wrapSalt, encoded))
            .putInt("attempts", 0).putBoolean("biometric", false).commit();
        Arrays.fill(hash, (byte) 0); Arrays.fill(secret, (byte) 0);
        if (!saved) throw new IllegalStateException("The PIN could not be saved. Free some device storage and try again.");
        sessionSecret = encoded; unlocked = true;
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
        String wrapped = prefs().getString("pinDbSecret", null);
        if (wrapped != null) {
            byte[] key = PinWrap.deriveKey(pin, Base64.decode(prefs().getString("pinWrapSalt", ""), Base64.NO_WRAP));
            try { sessionSecret = PinWrap.open(key, UnlockKeys.openForPin(wrapped)); }
            catch (AEADBadTagException damaged) { throw new IllegalStateException("The saved PIN key is damaged. Use Forgot PIN to recover with your screen lock."); }
            finally { Arrays.fill(key, (byte) 0); }
        } else {
            // Installed before the PIN wrap: the first open after this unlock saves one (ADR 0050).
            pendingPinSalt = PinWrap.salt(); pendingPinKey = PinWrap.deriveKey(pin, pendingPinSalt);
        }
        unlocked = true;
    }
    private static String pinWrap(String pin, byte[] wrapSalt, String secret) throws Exception {
        byte[] key = PinWrap.deriveKey(pin, wrapSalt);
        try { return UnlockKeys.sealForPin(PinWrap.seal(key, secret)); } finally { Arrays.fill(key, (byte) 0); }
    }
    private void savePendingPinWrap(String secret) throws Exception {
        String wrapped = UnlockKeys.sealForPin(PinWrap.seal(pendingPinKey, secret));
        if (!secret.equals(PinWrap.open(pendingPinKey, UnlockKeys.openForPin(wrapped)))) throw new IllegalStateException("PIN key verification failed.");
        if (!prefs().edit().putString("pinWrapSalt", encode(pendingPinSalt)).putString("pinDbSecret", wrapped).commit())
            throw new IllegalStateException("Could not save the PIN key. Free storage and try again.");
        Arrays.fill(pendingPinKey, (byte) 0); pendingPinKey = null; pendingPinSalt = null;
    }
    synchronized void requireUnlocked() { if (!unlocked) throw new IllegalStateException("Unlock Kairos to continue."); }
    synchronized boolean isUnlocked() { return unlocked; }
    synchronized void lock() {
        UtilsSecret.clearSessionSecret(); unlocked = false; recoveryUntil = 0; sessionSecret = null; recoverySecret = null;
        if (pendingPinKey != null) Arrays.fill(pendingPinKey, (byte) 0);
        pendingPinKey = null; pendingPinSalt = null;
    }
    /** Before the PIN wrap exists, the old biometric path still opens through the screen-lock key. */
    synchronized boolean biometricEnabled() throws Exception {
        return configured() && prefs().getBoolean("biometric", false) && (prefs().contains("biometricDbSecret") || !prefs().contains("pinDbSecret"));
    }
    synchronized boolean biometricWrapped() throws Exception { return configured() && prefs().contains("biometricDbSecret"); }
    synchronized void setBiometric(boolean enabled) throws Exception {
        requireUnlocked();
        if (enabled) throw new IllegalStateException("Turn biometrics on with a fingerprint or face check.");
        if (!prefs().edit().putBoolean("biometric", false).remove("biometricDbSecret").commit()) throw new IllegalStateException("Could not save biometric preference.");
        UnlockKeys.deleteBiometric();
    }
    synchronized Cipher biometricSealCipher() throws Exception {
        requireUnlocked();
        if (sessionSecret == null) throw new IllegalStateException("Unlock Kairos with your PIN, then turn biometrics on.");
        // The old key is replaced below, so its wrap goes first: a cancelled prompt must not leave a wrap nothing opens.
        if (!prefs().edit().putBoolean("biometric", false).remove("biometricDbSecret").commit()) throw new IllegalStateException("Could not save biometric preference.");
        return UnlockKeys.biometricSealCipher();
    }
    synchronized void saveBiometric(Cipher authenticated) throws Exception {
        requireUnlocked();
        if (sessionSecret == null) throw new IllegalStateException("Unlock Kairos with your PIN, then turn biometrics on.");
        if (!prefs().edit().putString("biometricDbSecret", UnlockKeys.sealForBiometric(authenticated, sessionSecret)).putBoolean("biometric", true).commit())
            throw new IllegalStateException("Could not save biometric preference.");
    }
    synchronized Cipher biometricOpenCipher() throws Exception {
        if (prefs().getBoolean("pinReplacementRequired", false)) throw new IllegalStateException("Choose a new Kairos PIN before unlocking.");
        String wrapped = prefs().getString("biometricDbSecret", null);
        if (wrapped == null) throw new IllegalStateException("Biometric unlock is not enabled.");
        try { return UnlockKeys.biometricOpenCipher(wrapped); }
        catch (android.security.keystore.KeyPermanentlyInvalidatedException changed) {
            prefs().edit().putBoolean("biometric", false).remove("biometricDbSecret").commit(); UnlockKeys.deleteBiometric();
            throw new IllegalStateException("Biometrics changed on this phone. Unlock with your PIN, then turn biometrics on again.");
        }
    }
    synchronized void biometricUnlock(Cipher authenticated) throws Exception {
        if (prefs().getBoolean("pinReplacementRequired", false)) throw new IllegalStateException("Choose a new Kairos PIN before unlocking.");
        sessionSecret = UnlockKeys.openForBiometric(authenticated, prefs().getString("biometricDbSecret", ""));
        unlocked = true;
    }
    synchronized void biometricUnlock() throws Exception {
        if (prefs().getBoolean("pinReplacementRequired", false)) throw new IllegalStateException("Choose a new Kairos PIN before unlocking.");
        if (!biometricEnabled()) throw new IllegalStateException("Biometric unlock is not enabled.");
        unlocked = true;
    }
    /** Called straight after Android authentication, while the screen-lock key's window is open. */
    synchronized void authorizePinReplacement() throws Exception {
        if (!configured()) throw new IllegalStateException("Set up Kairos first.");
        String legacy = prefs().getString("dbSecret", null), wrapped = prefs().getString("authenticatedDbSecret", null);
        if ((legacy == null || legacy.isEmpty()) && wrapped == null) throw new IllegalStateException("The database key is unavailable. Restore a backup after resetting Kairos.");
        String secret = legacy != null && !legacy.isEmpty() ? legacy : AuthenticatedKey.unwrap(context, wrapped);
        lock();
        if (!prefs().edit().putBoolean("pinReplacementRequired", true).commit())
            throw new IllegalStateException("Could not save recovery state. Try device authentication again.");
        recoverySecret = secret; recoveryUntil = SystemClock.elapsedRealtime() + 300000;
    }
    synchronized void replacePin(String pin, String confirmation) throws Exception {
        if (recoveryUntil == 0 || SystemClock.elapsedRealtime() >= recoveryUntil)
            throw new IllegalStateException("Authenticate with your device again before replacing your PIN.");
        if (pin == null || !pin.matches("[0-9]{6,12}")) throw new IllegalArgumentException("Choose a PIN with 6 to 12 digits.");
        if (!pin.equals(confirmation)) throw new IllegalArgumentException("The PINs do not match.");
        if (recoverySecret == null) throw new IllegalStateException("Authenticate with your device again before replacing your PIN.");
        byte[] salt = new byte[32]; new SecureRandom().nextBytes(salt);
        byte[] hash = derive(pin, salt); byte[] wrapSalt = PinWrap.salt();
        try {
            if (!prefs().edit().putString("salt", encode(salt)).putString("pinHash", encode(hash))
                .putString("pinWrapSalt", encode(wrapSalt)).putString("pinDbSecret", pinWrap(pin, wrapSalt, recoverySecret))
                .putBoolean("pinReplacementRequired", false).putInt("attempts", 0)
                .putLong("nextAttempt", 0).putLong("lastAttempt", 0).commit())
                throw new IllegalStateException("The new PIN could not be saved. Free device storage and try again.");
        } finally { Arrays.fill(hash, (byte) 0); }
        sessionSecret = recoverySecret; recoverySecret = null; recoveryUntil = 0; unlocked = true;
    }
    synchronized String backupRecoveryCode() throws Exception {
        requireUnlocked();
        String existing = prefs().getString("backupRecoveryCode", null);
        if (existing != null) return existing;
        String alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        byte[] entropy = new byte[40]; new SecureRandom().nextBytes(entropy);
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < entropy.length; i++) {
            if (i > 0 && i % 4 == 0) code.append('-');
            code.append(alphabet.charAt(entropy[i] & 31));
        }
        Arrays.fill(entropy, (byte) 0);
        String generated = code.toString();
        if (!prefs().edit().putString("backupRecoveryCode", generated).commit())
            throw new IllegalStateException("Could not save your recovery code. Free device storage and try again.");
        return generated;
    }
    synchronized boolean backupCodeAcknowledged() throws Exception { requireUnlocked(); return prefs().getBoolean("backupCodeAcknowledged", false); }
    synchronized void acknowledgeBackupCode(String code) throws Exception {
        requireUnlocked();
        if (!backupRecoveryCode().equals(code)) throw new IllegalArgumentException("Review your current recovery code before continuing.");
        if (!prefs().edit().putBoolean("backupCodeAcknowledged", true).commit()) throw new IllegalStateException("Could not save recovery-code confirmation.");
    }
    synchronized String protectedSecret() throws Exception {
        requireUnlocked();
        String wrapped = prefs().getString("authenticatedDbSecret", null);
        if (wrapped == null) {
            String legacy = prefs().getString("dbSecret", null);
            if (legacy == null || legacy.isEmpty()) throw new IllegalStateException("The database key is unavailable. Restore a backup after resetting Kairos.");
            wrapped = AuthenticatedKey.wrap(context, legacy);
            if (!legacy.equals(AuthenticatedKey.unwrap(context, wrapped))) throw new IllegalStateException("Device key verification failed.");
            if (!prefs().edit().putString("authenticatedDbSecret", wrapped).remove("dbSecret").commit())
                throw new IllegalStateException("Could not migrate the device key. Free storage and try again.");
        }
        if (sessionSecret != null) return sessionSecret;
        // Unlocked without the key in hand: an install from before the PIN wrap, opening one last time with Android's prompt.
        String secret = AuthenticatedKey.unwrap(context, wrapped);
        if (pendingPinKey != null) savePendingPinWrap(secret);
        sessionSecret = secret;
        return secret;
    }
    synchronized String secret() throws Exception {
        requireUnlocked();
        if (sessionSecret != null) return sessionSecret;
        return prefs().contains("authenticatedDbSecret") ? protectedSecret() : prefs().getString("dbSecret", "");
    }
}

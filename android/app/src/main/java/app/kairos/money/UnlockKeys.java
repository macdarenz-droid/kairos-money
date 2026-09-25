package app.kairos.money;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Keystore keys that each open the database key alone (ADR 0050): the PIN key needs no prompt, because the
 *  PIN layer inside is the secret; the biometric key needs a strong biometric on every use. */
final class UnlockKeys {
    static final String PIN_ALIAS = "kairos.money.pin-wrap.v1";
    static final String BIOMETRIC_ALIAS = "kairos.money.biometric-wrap.v1";
    private static final byte[] PIN_AAD = "kairos.sqlcipher.pin-device.v1".getBytes(StandardCharsets.UTF_8);
    private static final byte[] BIOMETRIC_AAD = "kairos.sqlcipher.biometric.v1".getBytes(StandardCharsets.UTF_8);
    private UnlockKeys() {}

    private static KeyStore keys() throws Exception { KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null); return keys; }
    private static SecretKey generate(KeyGenParameterSpec spec) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(spec); return generator.generateKey();
    }
    private static KeyGenParameterSpec.Builder aes(String alias) {
        return new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE);
    }
    private static SecretKey pinKey(boolean create) throws Exception {
        KeyStore keys = keys();
        if (keys.containsAlias(PIN_ALIAS)) return (SecretKey) keys.getKey(PIN_ALIAS, null);
        // A missing key with a saved wrap is damage, not a first use: never replace it silently.
        if (!create) throw new IllegalStateException("The saved PIN key is unavailable. Use Forgot PIN to recover with your screen lock.");
        return generate(aes(PIN_ALIAS).build());
    }
    private static String finish(Cipher cipher, byte[] aad, String clearText) throws Exception {
        cipher.updateAAD(aad);
        byte[] clear = clearText.getBytes(StandardCharsets.UTF_8);
        try { return PinWrap.encode(cipher.getIV()) + ":" + PinWrap.encode(cipher.doFinal(clear)); } finally { Arrays.fill(clear, (byte) 0); }
    }
    private static String[] split(String wrapped) {
        String[] pieces = wrapped.split(":", -1);
        if (pieces.length != 2) throw new IllegalStateException("A saved unlock key is damaged. Use Forgot PIN to recover with your screen lock.");
        return pieces;
    }
    private static String read(Cipher cipher, byte[] aad, String body) throws Exception {
        cipher.updateAAD(aad);
        byte[] clear = cipher.doFinal(PinWrap.decode(body));
        try { return new String(clear, StandardCharsets.UTF_8); } finally { Arrays.fill(clear, (byte) 0); }
    }

    static String sealForPin(String pinLayer) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, pinKey(true));
        return finish(cipher, PIN_AAD, pinLayer);
    }
    static String openForPin(String wrapped) throws Exception {
        String[] pieces = split(wrapped);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, pinKey(false), new GCMParameterSpec(128, PinWrap.decode(pieces[0])));
        return read(cipher, PIN_AAD, pieces[1]);
    }

    /** A fresh biometric key each time biometrics are turned on, so an old wrap can never open again. */
    static Cipher biometricSealCipher() throws Exception {
        deleteBiometric();
        KeyGenParameterSpec.Builder spec = aes(BIOMETRIC_ALIAS).setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        else spec.setUserAuthenticationValidityDurationSeconds(-1);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, generate(spec.build()));
        return cipher;
    }
    static String sealForBiometric(Cipher authenticated, String secret) throws Exception { return finish(authenticated, BIOMETRIC_AAD, secret); }
    /** Throws KeyPermanentlyInvalidatedException when a biometric was added or removed since. */
    static Cipher biometricOpenCipher(String wrapped) throws Exception {
        KeyStore keys = keys();
        if (!keys.containsAlias(BIOMETRIC_ALIAS)) throw new IllegalStateException("Turn biometrics on again in You, after unlocking with your PIN.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, (SecretKey) keys.getKey(BIOMETRIC_ALIAS, null), new GCMParameterSpec(128, PinWrap.decode(split(wrapped)[0])));
        return cipher;
    }
    static String openForBiometric(Cipher authenticated, String wrapped) throws Exception { return read(authenticated, BIOMETRIC_AAD, split(wrapped)[1]); }
    static void deleteBiometric() throws Exception { KeyStore keys = keys(); if (keys.containsAlias(BIOMETRIC_ALIAS)) keys.deleteEntry(BIOMETRIC_ALIAS); }
}

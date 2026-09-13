package app.kairos.money;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class AuthenticatedKey {
    static final String ALIAS = "kairos.money.authenticated-wrap.v1";
    private static final byte[] AAD = "kairos.sqlcipher.key.v1".getBytes(StandardCharsets.UTF_8);
    private static SecretKey key(Context context, boolean create) throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        if (!keys.containsAlias(ALIAS)) {
            if (!create) throw new IllegalStateException("This device key is unavailable. Restore an encrypted backup after resetting Kairos.");
            if (!((KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE)).isDeviceSecure())
                throw new IllegalStateException("Set an Android screen lock before opening Kairos. Your existing data has not changed.");
            KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true);
            if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(60, KeyProperties.AUTH_DEVICE_CREDENTIAL | KeyProperties.AUTH_BIOMETRIC_STRONG);
            else spec.setUserAuthenticationValidityDurationSeconds(60);
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(spec.build()); generator.generateKey();
        }
        return (SecretKey) keys.getKey(ALIAS, null);
    }
    static String wrap(Context context, String secret) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(context, true)); cipher.updateAAD(AAD);
        byte[] clear = secret.getBytes(StandardCharsets.UTF_8);
        try { return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(clear), Base64.NO_WRAP); }
        finally { Arrays.fill(clear, (byte) 0); }
    }
    static String unwrap(Context context, String wrapped) throws Exception {
        String[] pieces = wrapped.split(":", -1);
        if (pieces.length != 2) throw new IllegalStateException("The saved device key is damaged. Restore an encrypted backup after resetting Kairos.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(context, false), new GCMParameterSpec(128, Base64.decode(pieces[0], Base64.NO_WRAP))); cipher.updateAAD(AAD);
        byte[] clear = cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP));
        try { return new String(clear, StandardCharsets.UTF_8); } finally { Arrays.fill(clear, (byte) 0); }
    }
}

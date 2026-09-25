package app.kairos.money;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * The PIN's layer of the database key's PIN wrap (ADR 0050). Plain Java, so it runs in JVM unit tests;
 * the stored value is sealed again by a non-exportable Keystore key in {@link UnlockKeys}.
 */
final class PinWrap {
    static final int ITERATIONS = 210000;
    private static final byte[] AAD = "kairos.sqlcipher.pin.v1".getBytes(StandardCharsets.UTF_8);
    private PinWrap() {}

    static byte[] salt() { byte[] salt = new byte[32]; new SecureRandom().nextBytes(salt); return salt; }

    static byte[] deriveKey(String pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }

    static String seal(byte[] key, String secret) throws Exception {
        byte[] iv = new byte[12]; new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv)); cipher.updateAAD(AAD);
        byte[] clear = secret.getBytes(StandardCharsets.UTF_8);
        try { return encode(iv) + ":" + encode(cipher.doFinal(clear)); } finally { Arrays.fill(clear, (byte) 0); }
    }

    /** Throws AEADBadTagException when the key is not the one that sealed it. */
    static String open(byte[] key, String sealed) throws Exception {
        String[] pieces = sealed.split(":", -1);
        if (pieces.length != 2) throw new AEADBadTagException("Malformed PIN wrap.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, decode(pieces[0]))); cipher.updateAAD(AAD);
        byte[] clear = cipher.doFinal(decode(pieces[1]));
        try { return new String(clear, StandardCharsets.UTF_8); } finally { Arrays.fill(clear, (byte) 0); }
    }

    static String encode(byte[] value) { return Base64.getEncoder().encodeToString(value); }
    static byte[] decode(String value) { return Base64.getDecoder().decode(value); }
}

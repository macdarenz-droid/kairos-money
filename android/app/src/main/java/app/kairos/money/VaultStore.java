package app.kairos.money;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import java.io.File;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** No PIN, PIN hash or database key is persisted in WebView storage. */
final class VaultStore {
    static final String PREFS = "kairos-vault";
    static final String KEY_ALIAS = "kairos.money.vault";
    private final Context context;
    private SharedPreferences prefs;
    private boolean unlocked;
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
    synchronized void lock() { unlocked = false; }
    synchronized boolean biometricEnabled() throws Exception { return configured() && prefs().getBoolean("biometric", false); }
    synchronized void setBiometric(boolean enabled) throws Exception {
        requireUnlocked();
        if (!prefs().edit().putBoolean("biometric", enabled).commit()) throw new IllegalStateException("Could not save biometric preference.");
    }
    synchronized void biometricUnlock() throws Exception {
        if (!biometricEnabled()) throw new IllegalStateException("Biometric unlock is not enabled.");
        unlocked = true;
    }
    synchronized String secret() throws Exception { requireUnlocked(); return prefs().getString("dbSecret", ""); }
    synchronized boolean aiConfigured() throws Exception { return configured() && !prefs().getString("aiApiKey", "").isEmpty(); }
    synchronized String aiModel() throws Exception { return prefs().getString("aiModel", "gpt-4o-mini"); }
    synchronized void configureAi(String apiKey, String model) throws Exception {
        requireUnlocked();
        String selectedModel = model == null || model.trim().isEmpty() ? "gpt-4o-mini" : model.trim();
        if (!selectedModel.matches("[A-Za-z0-9._-]{2,80}")) throw new IllegalArgumentException("Enter a valid OpenAI model name.");
        String selectedKey = apiKey == null ? "" : apiKey.trim();
        if (!selectedKey.isEmpty() && !selectedKey.matches("[A-Za-z0-9._-]{20,256}")) throw new IllegalArgumentException("The API key does not look valid.");
        SharedPreferences preferences = prefs();
        if (selectedKey.isEmpty() && preferences.getString("aiApiKey", "").isEmpty()) throw new IllegalArgumentException("Enter an OpenAI API key first.");
        SharedPreferences.Editor edit = preferences.edit().putString("aiModel", selectedModel);
        if (!selectedKey.isEmpty()) edit.putString("aiApiKey", selectedKey);
        if (!edit.commit()) throw new IllegalStateException("Could not save AI settings. Free some device storage and try again.");
    }
    synchronized void clearAi() throws Exception {
        requireUnlocked();
        if (!prefs().edit().remove("aiApiKey").remove("aiModel").commit()) throw new IllegalStateException("Could not remove AI settings.");
    }
    String completeAi(String system, String prompt, boolean json) throws Exception {
        final String apiKey, model;
        synchronized (this) {
            requireUnlocked(); SharedPreferences preferences = prefs();
            apiKey = preferences.getString("aiApiKey", ""); model = preferences.getString("aiModel", "gpt-4o-mini");
        }
        if (apiKey.isEmpty()) throw new IllegalStateException("Add an OpenAI API key in Settings to use the AI assistant.");
        if (system == null || system.length() > 12000 || prompt == null || prompt.length() > 30000) throw new IllegalArgumentException("The AI request is too large.");
        JSONObject body = new JSONObject(); body.put("model", model); body.put("temperature", 0); body.put("max_tokens", 700);
        JSONArray messages = new JSONArray(); messages.put(new JSONObject().put("role", "system").put("content", system)); messages.put(new JSONObject().put("role", "user").put("content", prompt)); body.put("messages", messages);
        if (json) body.put("response_format", new JSONObject().put("type", "json_object"));
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL("https://api.openai.com/v1/chat/completions").openConnection();
            connection.setRequestMethod("POST"); connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setUseCaches(false); connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + apiKey); connection.setRequestProperty("Content-Type", "application/json; charset=utf-8"); connection.setRequestProperty("Accept", "application/json");
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) { output.write(payload); }
            int status = connection.getResponseCode(); InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String response = stream == null ? "" : new String(readLimited(stream, 1048576), StandardCharsets.UTF_8);
            if (status == 401) throw new IllegalStateException("OpenAI rejected this API key. Check the key in Settings.");
            if (status == 429) throw new IllegalStateException("OpenAI is rate-limiting this request or the account has no available quota.");
            if (status < 200 || status >= 300) throw new IllegalStateException("OpenAI could not complete the request (HTTP " + status + "). Try again shortly.");
            String content = new JSONObject(response).getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content", "").trim();
            if (content.isEmpty()) throw new IllegalStateException("The AI service returned an empty answer. Try again.");
            return content;
        } catch (java.net.SocketTimeoutException error) { throw new IllegalStateException("The AI request timed out. Check your connection and try again."); }
        catch (java.net.UnknownHostException error) { throw new IllegalStateException("OpenAI could not be reached. Check your connection and try again."); }
        catch (java.io.IOException error) { throw new IllegalStateException("The AI request failed. Check your connection and try again."); }
        catch (org.json.JSONException error) { throw new IllegalStateException("OpenAI returned unreadable data. Try again."); }
        finally { if (connection != null) connection.disconnect(); }
    }
    private static byte[] readLimited(InputStream stream, int maximum) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int read;
            while ((read = input.read(buffer)) != -1) { if (output.size() + read > maximum) throw new IllegalStateException("The AI response exceeded the supported size."); output.write(buffer, 0, read); }
            return output.toByteArray();
        }
    }
}

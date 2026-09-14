package app.kairos.money;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.UiModeManager;
import android.os.Build;
import android.security.keystore.UserNotAuthenticatedException;
import com.getcapacitor.community.database.sqlite.SQLite.UtilsSecret;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "KairosVault")
public class KairosVaultPlugin extends Plugin {
    private VaultStore store;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile long pausedAt = -1;
    private byte[] exportBytes;
    @Override public void load() { store = new VaultStore(getContext()); }
    private interface Operation { void run() throws Exception; }
    private void perform(PluginCall call, Operation operation) {
        worker.execute(() -> {
            try { operation.run(); }
            catch (IllegalArgumentException | IllegalStateException error) { call.reject(error.getMessage()); }
            catch (Exception error) { call.reject("Secure device storage is unavailable. Restart Kairos and try again."); }
        });
    }
    private boolean biometricAvailable() {
        return BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS;
    }
    @PluginMethod public void status(PluginCall call) { perform(call, () -> {
        JSObject result = new JSObject(); result.put("configured", store.configured());
        result.put("biometric", biometricAvailable()); result.put("biometricEnabled", store.biometricEnabled());
        result.put("unlocked", store.isUnlocked());
        result.put("backupCodeRequired", store.isUnlocked() && !store.backupCodeAcknowledged()); call.resolve(result);
    }); }
    @PluginMethod public void setup(PluginCall call) { perform(call, () -> { store.setup(call.getString("pin"), call.getString("confirm")); call.resolve(); }); }
    @PluginMethod public void unlock(PluginCall call) { perform(call, () -> { store.unlock(call.getString("pin")); call.resolve(); }); }
    private void supplyDatabaseKey(PluginCall call) throws Exception {
        String secret = store.protectedSecret();
        UtilsSecret.clearLegacySecret();
        UtilsSecret.setSessionSecret(secret);
        call.resolve();
    }
    @PluginMethod public void prepareDatabase(PluginCall call) { perform(call, () -> {
        try { supplyDatabaseKey(call); }
        catch (UserNotAuthenticatedException needed) {
            getActivity().runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < 30) {
                    KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
                    Intent intent = keyguard.createConfirmDeviceCredentialIntent("Open Kairos", "Confirm your Android screen lock to access the encrypted ledger.");
                    if (intent == null) { store.lock(); call.reject("Set an Android screen lock before opening Kairos."); return; }
                    startActivityForResult(call, intent, "databaseAuthenticationResult"); return;
                }
                BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { perform(call, () -> { pausedAt = -1; supplyDatabaseKey(call); }); }
                    @Override public void onAuthenticationError(int code, CharSequence message) { store.lock(); call.reject("Device authentication did not complete. Your ledger remains locked."); }
                });
                prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle("Open Kairos")
                    .setSubtitle("Confirm access to your encrypted ledger.")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL).build());
            });
        }
    }); }
    @ActivityCallback private void databaseAuthenticationResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        perform(call, () -> {
            if (result.getResultCode() != Activity.RESULT_OK) { store.lock(); throw new IllegalStateException("Device authentication did not complete. Your ledger remains locked."); }
            pausedAt = -1; supplyDatabaseKey(call);
        });
    }

    @PluginMethod public void lock(PluginCall call) { store.lock(); call.resolve(); }
    @PluginMethod public void setBiometric(PluginCall call) { perform(call, () -> {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
        if (enabled && !biometricAvailable()) throw new IllegalStateException("Set up a strong fingerprint or face unlock in Android settings first.");
        store.setBiometric(enabled); call.resolve();
    }); }
    @PluginMethod public void authenticate(PluginCall call) {
        perform(call, () -> {
            if (!store.biometricEnabled() || !biometricAvailable()) throw new IllegalStateException("Use your PIN to unlock Kairos.");
            getActivity().runOnUiThread(() -> {
                BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        perform(call, () -> { store.biometricUnlock(); call.resolve(); });
                    }
                    @Override public void onAuthenticationError(int code, CharSequence message) { call.reject("Biometric unlock was cancelled or unavailable. Use your PIN."); }
                });
                prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Kairos")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG).setNegativeButtonText("Use PIN").build());
            });
        });
    }
    @PluginMethod public void recoverPin(PluginCall call) { perform(call, () -> {
        if (!store.configured()) throw new IllegalStateException("Set up Kairos first.");
        store.lock();
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if (!keyguard.isDeviceSecure()) throw new IllegalStateException("Device recovery is unavailable because Android has no screen lock configured.");
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT < 30) {
                Intent intent = keyguard.createConfirmDeviceCredentialIntent("Recover Kairos PIN", "Confirm your Android screen lock to choose a new Kairos PIN.");
                if (intent == null) { call.reject("Device authentication is unavailable. Try again from the lock screen."); return; }
                startActivityForResult(call, intent, "recoveryResult");
                return;
            }
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    perform(call, () -> { store.authorizePinReplacement(); pausedAt = -1; call.resolve(); });
                }
                @Override public void onAuthenticationError(int code, CharSequence message) { call.reject("Device authentication did not complete. Your ledger remains locked."); }
            });
            prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle("Recover Kairos PIN")
                .setSubtitle("Authenticate, then choose a new Kairos PIN.")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL).build());
        });
    }); }
    @ActivityCallback private void recoveryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        perform(call, () -> {
            if (result.getResultCode() != Activity.RESULT_OK) throw new IllegalStateException("Device authentication did not complete. Your ledger remains locked.");
            store.authorizePinReplacement(); pausedAt = -1; call.resolve();
        });
    }
    @PluginMethod public void replacePin(PluginCall call) { perform(call, () -> { store.replacePin(call.getString("pin"), call.getString("confirm")); call.resolve(); }); }
    @PluginMethod public void resetLockedApp(PluginCall call) { perform(call, () -> {
        if (!"DELETE KAIROS".equals(call.getString("confirmation"))) throw new IllegalArgumentException("Type DELETE KAIROS to confirm permanent deletion.");
        store.lock();
        ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (!manager.clearApplicationUserData()) throw new IllegalStateException("Android could not reset Kairos. Use Android Settings > Apps > Kairos > Storage > Clear data.");
    }); }
    @Override protected void handleOnPause() { pausedAt = SystemClock.elapsedRealtime(); }
    @Override protected void handleOnResume() {
        if (pausedAt >= 0 && SystemClock.elapsedRealtime() - pausedAt >= 60000) store.lock();
        pausedAt = -1;
    }
    @PluginMethod public void setTheme(PluginCall call) {
        String theme = call.getString("theme", "system");
        if (!theme.equals("system") && !theme.equals("dark") && !theme.equals("light")) { call.reject("Unknown theme."); return; }
        if (!getContext().getSharedPreferences("kairos-appearance", Context.MODE_PRIVATE).edit().putString("theme", theme).commit()) { call.reject("Could not save appearance."); return; }
        getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).applyAppearance(true));
        if (Build.VERSION.SDK_INT >= 31) {
            UiModeManager manager = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
            manager.setApplicationNightMode(theme.equals("dark") ? UiModeManager.MODE_NIGHT_YES : theme.equals("light") ? UiModeManager.MODE_NIGHT_NO : UiModeManager.MODE_NIGHT_AUTO);
        }
        call.resolve();
    }
    @PluginMethod public void backupRecovery(PluginCall call) { perform(call, () -> {
        JSObject result = new JSObject(); result.put("code", store.backupRecoveryCode()); result.put("acknowledged", store.backupCodeAcknowledged()); call.resolve(result);
    }); }
    @PluginMethod public void acknowledgeBackupCode(PluginCall call) { perform(call, () -> { store.acknowledgeBackupCode(call.getString("code")); call.resolve(); }); }
    @PluginMethod public void exportFile(PluginCall call) { perform(call, () -> {
        store.requireUnlocked();
        if (exportBytes != null) throw new IllegalStateException("Finish the current export first.");
        String content = call.getString("base64");
        if (content == null) throw new IllegalArgumentException("No export data was supplied.");
        exportBytes = Base64.decode(content, Base64.NO_WRAP);
        // Capacitor persists activity-call arguments; the ZIP must stay out of the Binder bundle.
        call.getData().remove("base64");
        boolean backup = "Kairos-money-backup.kairos".equals(call.getString("fileName"));
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.setType(backup ? "application/octet-stream" : "application/zip");
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.putExtra(Intent.EXTRA_TITLE, backup ? "Kairos-money-backup.kairos" : "Kairos-money-export.zip");
        getActivity().runOnUiThread(() -> startActivityForResult(call, intent, "exportResult"));
    }); }
    @ActivityCallback private void exportResult(PluginCall call, ActivityResult result) {
        if (call == null) { if (exportBytes != null) Arrays.fill(exportBytes, (byte) 0); exportBytes = null; return; }
        perform(call, () -> {
            try {
                boolean saved = result.getResultCode() == Activity.RESULT_OK && result.getData() != null && result.getData().getData() != null;
                if (saved) {
                    if (exportBytes == null) throw new IllegalStateException("Export was interrupted. Unlock Kairos and export again.");
                    try (OutputStream stream = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
                        if (stream == null) throw new IllegalStateException("This location cannot save files. Choose another folder.");
                        stream.write(exportBytes); stream.flush();
                    }
                }
                JSObject response = new JSObject(); response.put("saved", saved); call.resolve(response);
            } finally { if (exportBytes != null) Arrays.fill(exportBytes, (byte) 0); exportBytes = null; }
        });
    }
    @PluginMethod public void erase(PluginCall call) { perform(call, () -> {
        store.requireUnlocked();
        // Android clears this application's database, files, cache, preferences and keystore,
        // then terminates it. Explicitly requested external exports belong to the user.
        ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (!manager.clearApplicationUserData()) throw new IllegalStateException("Android could not delete app data. Use Android Settings > Apps > Kairos > Storage > Clear data.");
    }); }
    @Override protected void handleOnDestroy() { DatabaseLifecycle.close(getBridge()); store.lock(); if (exportBytes != null) Arrays.fill(exportBytes, (byte) 0); worker.shutdown(); }
}

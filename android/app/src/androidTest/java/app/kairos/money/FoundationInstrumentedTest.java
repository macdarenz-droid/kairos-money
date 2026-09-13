package app.kairos.money;

import static org.junit.Assert.*;
import android.content.Context;
import android.graphics.Bitmap;
import android.view.WindowManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import net.sqlcipher.database.SQLiteDatabase;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class FoundationInstrumentedTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private MainActivity activity;
    private String evaluate(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView evaluation timed out", latch.await(15, TimeUnit.SECONDS)); return result.get();
    }
    private void awaitJs(String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 45000;
        while (System.currentTimeMillis() < deadline) { if ("true".equals(evaluate(condition))) return; Thread.sleep(150); }
        fail("UI condition not met: " + condition + " Current page: " + evaluate("document.body.innerText"));
    }
    private void click(String text) throws Exception {
        String expression = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + JSONObject.quote(text) + ")";
        awaitJs("Boolean(" + expression + ")"); evaluate(expression + ".click()");
    }
    private void input(String label, String value) throws Exception {
        evaluate("(()=>{const label=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith(" + JSONObject.quote(label) + ")); const i=label.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i," + JSONObject.quote(value) + ");i.dispatchEvent(new Event('input',{bubbles:true}));})()");
    }
    private void screenshot(String name) throws Exception {
        // Screenshots contain synthetic test data only. Production always sets FLAG_SECURE.
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
        Thread.sleep(350);
        Bitmap shot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        File directory = new File(context.getExternalFilesDir(null), "evidence"); assertTrue(directory.exists() || directory.mkdirs());
        try (FileOutputStream stream = new FileOutputStream(new File(directory, name + ".png"))) { assertTrue(shot.compress(Bitmap.CompressFormat.PNG, 100, stream)); }
        shot.recycle();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE));
    }
    @Test public void a_vaultAndCipher() throws Exception {
        assertTrue("Instrumentation must run on a fresh test install", !new VaultStore(context).configured());
        VaultStore store = new VaultStore(context);
        try { store.setup("246810", "135790"); fail("Mismatched PIN accepted"); } catch (IllegalArgumentException expected) {}
        store.setup("246810", "246810"); String secret = store.secret(); assertFalse(secret.isEmpty());
        store.lock(); try { store.secret(); fail("Locked vault exposed key"); } catch (IllegalStateException expected) {}
        try { store.unlock("000000"); fail("Wrong PIN accepted"); } catch (IllegalArgumentException expected) {}
        store.unlock("246810"); assertEquals(secret, store.secret());
        SQLiteDatabase.loadLibs(context); File path = context.getDatabasePath("synthetic-cipher-test.db");
        SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(path, secret, null);
        db.execSQL("CREATE TABLE proof(amount_minor INTEGER, label TEXT)");
        db.execSQL("INSERT INTO proof VALUES(12345, 'SYNTHETIC ENCRYPTION SENTINEL')"); db.close();
        String raw = new String(Files.readAllBytes(path.toPath()), StandardCharsets.ISO_8859_1);
        assertFalse(raw.startsWith("SQLite format 3")); assertFalse(raw.contains("SYNTHETIC ENCRYPTION SENTINEL"));
        try { SQLiteDatabase.openDatabase(path.getPath(), "wrong-key", null, SQLiteDatabase.OPEN_READONLY).close(); fail("Wrong key accepted"); } catch (net.sqlcipher.database.SQLiteException expected) {}
        try { android.database.sqlite.SQLiteDatabase plain = android.database.sqlite.SQLiteDatabase.openDatabase(path.getPath(), null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY); try { plain.rawQuery("SELECT * FROM proof", null).getCount(); fail("Plain SQLite read encrypted data"); } finally { plain.close(); } } catch (android.database.sqlite.SQLiteException expected) {}
        assertTrue(context.deleteDatabase(path.getName())); assertFalse(path.exists());
        context.deleteSharedPreferences(VaultStore.PREFS); KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);keys.deleteEntry(VaultStore.KEY_ALIAS);
    }
    @Test public void b_realAppFlowAndThemes() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a -> activity = a);
            awaitJs("document.body.innerText.includes('Choose a PIN')");
            android.os.Bundle startup = context.getPackageManager().getProviderInfo(
                new android.content.ComponentName(context, "androidx.startup.InitializationProvider"),
                android.content.pm.PackageManager.GET_META_DATA).metaData;
            assertNotNull("AndroidX startup metadata missing", startup);
            assertFalse("Offline app must not start the downloadable emoji font provider",
                startup.containsKey("androidx.emoji2.text.EmojiCompatInitializer"));
            assertTrue("Lifecycle initialization must remain available",
                startup.containsKey("androidx.lifecycle.ProcessLifecycleInitializer"));
            assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
            input("Choose a PIN", "246810"); input("Confirm PIN", "246810"); click("Create private ledger");
            awaitJs("Boolean(document.querySelector('nav'))");
            screenshot("today-initial");
            click("Ledger"); click("Set up an account"); input("Account name", "Synthetic everyday"); input("Opening balance", "123.45"); click("Save account");
            awaitJs("document.body.innerText.includes('Synthetic everyday') && !document.querySelector('dialog')");
            assertTrue(evaluate("document.body.innerText").contains("$123.45"));
            for (String theme : new String[]{"Light", "Dark"}) {
                click("You"); click(theme); awaitJs("document.documentElement.dataset.theme===" + JSONObject.quote(theme.toLowerCase()));
                for (String tab : new String[]{"Today","Ledger","Insights","You"}) { click(tab); screenshot(theme.toLowerCase() + "-" + tab.toLowerCase()); }
            }
            click("Quick"); screenshot("dark-quick"); input("Find an action", "settings"); click("Open settings");
            click("Lock now"); awaitJs("document.body.innerText.includes('Welcome back')"); assertEquals("false", evaluate("Boolean(document.querySelector('nav'))"));
            input("PIN", "246810"); click("Unlock"); awaitJs("Boolean(document.querySelector('nav'))");
            File dbPath = context.getDatabasePath("kairos-moneySQLite.db"); assertTrue("Real app database missing", dbPath.exists());
            String bytes = new String(Files.readAllBytes(dbPath.toPath()), StandardCharsets.ISO_8859_1);
            assertFalse(bytes.startsWith("SQLite format 3")); assertFalse(bytes.contains("Synthetic everyday"));
            assertEquals("false", evaluate("Boolean(localStorage.getItem('pin') || localStorage.getItem('dbSecret'))"));
        }
    }
}

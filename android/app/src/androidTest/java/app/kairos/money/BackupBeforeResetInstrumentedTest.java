package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.community.database.sqlite.SQLite.UtilsSecret;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class BackupBeforeResetInstrumentedTest {
    @Test public void savesEncryptedBackupThroughAndroidPicker() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final MainActivity[] current = new MainActivity[1]; scenario.onActivity(activity -> current[0] = activity);
            BackupTestUi ui = new BackupTestUi(current[0]); ui.unlock("246810");
            String before = DatabaseDigest.hash(InstrumentationRegistry.getInstrumentation().getTargetContext(), UtilsSecret.getPassphrase());
            ui.click("You"); ui.click("Encrypted backup"); ui.click("Save backup or view recovery code");
            ui.await("Boolean(Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith('Recovery code'))) ");
            String recoveryCode = ui.value("Recovery code");
            ui.js("(()=>{const c=document.querySelector('dialog input[type=checkbox]');if(!c.checked)c.click();})()");
            ui.click("Choose backup location"); ui.saveDocument();
            ui.await("document.body.innerText.includes('Your encrypted backup was saved.')");
            String after = DatabaseDigest.hash(InstrumentationRegistry.getInstrumentation().getTargetContext(), UtilsSecret.getPassphrase());
            assertEquals("Saving a backup changed the ledger", before, after);
            byte[] backup = ui.shell("cat /sdcard/Download/Kairos-money-backup.kairos");
            assertTrue("Android picker did not save an encrypted backup", backup.length > 64);
            String exposed = new String(backup, StandardCharsets.ISO_8859_1);
            assertFalse(exposed.startsWith("SQLite format 3")); assertFalse(exposed.contains("Synthetic everyday"));
            ui.writeExternal("kairos-test-recovery.txt", recoveryCode);
            ui.writeExternal("kairos-test-ledger-digest.txt", after);
        }
    }
}

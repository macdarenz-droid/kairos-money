package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class BackupAfterResetInstrumentedTest {
    @Test public void refusesWrongCodeThenRestoresExactLedgerThroughPicker() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final MainActivity[] current = new MainActivity[1]; scenario.onActivity(activity -> current[0] = activity);
            BackupTestUi ui = new BackupTestUi(current[0]); ui.setup("135790");
            String code = ui.readExternal("kairos-test-recovery.txt"), expected = ui.readExternal("kairos-test-ledger-digest.txt");
            ui.click("You"); ui.click("Encrypted backup"); ui.click("Restore a backup");
            String emptyLedger = DatabaseDigest.hash(current[0]);
            String wrong = (code.startsWith("2") ? "3" : "2") + code.substring(1);
            ui.input("Backup recovery code", wrong); ui.click("Choose backup file"); ui.chooseDocument("Kairos-money-backup.kairos");
            ui.await("document.body.innerText.includes('does not match, or this backup is damaged')");
            assertEquals("Wrong recovery code wrote ledger data", 0, DatabaseDigest.userRows(current[0]));
            assertEquals("Wrong recovery code changed the fresh database", emptyLedger, DatabaseDigest.hash(current[0]));
            ui.input("Backup recovery code", code); ui.click("Choose backup file"); ui.chooseDocument("Kairos-money-backup.kairos");
            ui.await("document.body.innerText.includes('Your ledger, import history and coverage were restored.')");
            assertEquals("Restored ledger differs from the saved ledger", expected, DatabaseDigest.hash(current[0]));
            ui.await("!document.querySelector('dialog')");
            ui.click("You"); ui.click("Lock now"); ui.unlock("135790");
            assertEquals("Restore changed the replacement PIN or ledger", expected, DatabaseDigest.hash(current[0]));
            ui.click("You"); ui.click("Lock now"); ui.click("Forgot PIN?"); ui.click("Use device authentication");
            ui.await("document.body.innerText.includes('Choose a new PIN')");
            ui.input("New PIN", "246810"); ui.input("Confirm PIN", "246810"); ui.click("Save new PIN"); ui.await("Boolean(document.querySelector('nav'))");
            assertEquals("PIN replacement after restore changed the ledger", expected, DatabaseDigest.hash(current[0]));
            ui.shell("rm -f /sdcard/Download/Kairos-money-backup.kairos /sdcard/Download/kairos-test-recovery.txt /sdcard/Download/kairos-test-ledger-digest.txt");
        }
    }
}

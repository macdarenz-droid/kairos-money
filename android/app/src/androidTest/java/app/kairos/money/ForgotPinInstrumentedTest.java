package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.community.database.sqlite.SQLite.UtilsSecret;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ForgotPinInstrumentedTest {
    @Test public void deviceAuthenticationReplacesPinAndRetainsLedger() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final MainActivity[] current = new MainActivity[1]; scenario.onActivity(activity -> current[0] = activity);
            BackupTestUi ui = new BackupTestUi(current[0]); ui.unlock("246810");
            String before = DatabaseDigest.hash(InstrumentationRegistry.getInstrumentation().getTargetContext(), UtilsSecret.getPassphrase());
            ui.click("You"); ui.click("Lock now"); ui.await("document.body.innerText.includes('Welcome back')");
            ui.click("Forgot PIN?"); ui.click("Use device authentication"); ui.await("document.body.innerText.includes('Choose a new PIN')");
            NativeEvidence.capture(current[0], "dark-forgot-pin-replacement");
            ui.input("New PIN", "135790"); ui.input("Confirm PIN", "135790"); ui.click("Save new PIN"); ui.await("Boolean(document.querySelector('nav'))");
            assertEquals(before, DatabaseDigest.hash(InstrumentationRegistry.getInstrumentation().getTargetContext(), UtilsSecret.getPassphrase()));
            ui.click("You"); ui.click("Lock now"); ui.input("PIN", "246810"); ui.click("Unlock"); ui.await("document.body.innerText.includes('That PIN did not match')");
            ui.input("PIN", "135790"); ui.click("Unlock"); ui.await("Boolean(document.querySelector('nav'))");
            assertEquals(before, DatabaseDigest.hash(InstrumentationRegistry.getInstrumentation().getTargetContext(), UtilsSecret.getPassphrase()));
            ui.click("You"); ui.click("Lock now"); ui.click("Forgot PIN?"); ui.click("Use device authentication"); ui.await("document.body.innerText.includes('Choose a new PIN')");
            ui.input("New PIN", "246810"); ui.input("Confirm PIN", "246810"); ui.click("Save new PIN"); ui.await("Boolean(document.querySelector('nav'))");
            assertEquals(before, DatabaseDigest.hash(InstrumentationRegistry.getInstrumentation().getTargetContext(), UtilsSecret.getPassphrase()));
        }
    }
}

package app.kairos.money;

import static org.junit.Assert.fail;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Successful reset terminates this process; the host verifier checks zero app-owned files. */
@RunWith(AndroidJUnit4.class)
public class ResetForRestoreInstrumentedTest {
    @Test public void resetFromLockedRecoverySheet() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final MainActivity[] current = new MainActivity[1]; scenario.onActivity(activity -> current[0] = activity);
            BackupTestUi ui = new BackupTestUi(current[0]); ui.await("document.body.innerText.includes('Welcome back')");
            ui.click("Forgot PIN?"); ui.click("Reset app"); ui.js("document.querySelector('dialog input[type=checkbox]').click()"); ui.input("Type DELETE KAIROS to confirm", "DELETE KAIROS"); ui.click("Permanently reset app");
            Thread.sleep(15000); fail("Android did not terminate Kairos after reset.");
        }
    }
}

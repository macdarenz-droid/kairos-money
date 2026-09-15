package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * What entering data actually costs, measured on the device.
 *
 * LOW_EFFORT_USABILITY.md requires a recorded baseline before any tap-count target is set, because the
 * interaction counts in LAZY_USER_SCAN.md were read from source rather than measured. This drives the
 * shipped UI through real tasks and counts every tap and typing session it performs, writing the result as
 * evidence. It asserts only the invariants already claimed — the repeat path needs no typing, and every
 * path still ends at a Save the user presses — and deliberately sets no target number.
 */
public class UsabilityBaselineInstrumentedTest {
    private MainActivity activity;
    private int taps=0,typingSessions=0;

    private String js(String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        activity.runOnUiThread(()->activity.getBridge().getWebView().evaluateJavascript(script,r->{value.set(r);done.countDown();}));
        assertTrue("WebView did not respond",done.await(15,TimeUnit.SECONDS));return value.get();
    }
    private void awaitJs(String condition) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+30000;
        while(SystemClock.elapsedRealtime()<deadline){if("true".equals(js(condition)))return;Thread.sleep(150);}
        fail("Condition never held: "+condition+"; page: "+js("document.body.innerText"));
    }
    /** One tap by the user, counted. */
    private void tap(String name) throws Exception {
        String button="Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSONObject.quote(name)+")";
        awaitJs("Boolean("+button+")");js(button+".click()");taps++;
    }
    /** One tap on a control matched by its accessible label, counted. */
    private void tapLabelled(String fragment) throws Exception {
        String button="Array.from(document.querySelectorAll('button')).find(e=>(e.getAttribute('aria-label')||'').includes("+JSONObject.quote(fragment)+"))";
        awaitJs("Boolean("+button+")");js(button+".click()");taps++;
    }
    /** One typing session: the keyboard appears and the user types. */
    private void type(String label,String text) throws Exception {
        String node="Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith("+JSONObject.quote(label)+"))?.querySelector('input')";
        awaitJs("Boolean("+node+")");
        js("(()=>{const i="+node+";Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,"+JSONObject.quote(text)+");i.dispatchEvent(new Event('input',{bubbles:true}));})()");
        typingSessions++;
    }
    private void unlock() throws Exception {
        awaitJs("document.body.innerText.includes('Welcome back')");type("PIN","246810");tap("Unlock");
        awaitJs("Boolean(document.querySelector('nav'))");
        // Setup is not part of any measured task.
        taps=0;typingSessions=0;
    }

    @Test public void recordingATransactionAndRepeatingItCostWhatIsMeasuredHere() throws Throwable {
        JSONArray tasks=new JSONArray();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();

            // An account is required before a transaction can be recorded; its cost is recorded separately
            // because it is a one-time setup rather than an everyday task.
            tap("Set up an account");
            type("Account name","Everyday");type("Institution","Synthetic Bank");
            tap("Save account");
            awaitJs("!document.body.innerText.includes('Save account')");
            tasks.put(new JSONObject().put("task","set up the first account").put("taps",taps).put("typing_sessions",typingSessions).put("everyday",false));
            taps=0;typingSessions=0;

            // Task one: record an expense from scratch.
            tap("Add transaction");
            type("Amount","15.00");type("Description","Cafe Mika");
            tap("Save transaction");
            awaitJs("!document.body.innerText.includes('Save transaction')");
            int scratchTaps=taps,scratchTyping=typingSessions;
            tasks.put(new JSONObject().put("task","record an expense from scratch").put("taps",scratchTaps).put("typing_sessions",scratchTyping).put("everyday",true));
            assertTrue("Recording from scratch should require typing the amount and description",scratchTyping>=2);
            taps=0;typingSessions=0;

            // Task two: record the same expense again from the repeat tile.
            tapLabelled("Record Cafe Mika");
            awaitJs("Boolean(Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Save transaction'))");
            tap("Save transaction");
            awaitJs("!document.body.innerText.includes('Save transaction')");
            int repeatTaps=taps,repeatTyping=typingSessions;
            tasks.put(new JSONObject().put("task","record the same expense again").put("taps",repeatTaps).put("typing_sessions",repeatTyping).put("everyday",true));

            // The claims this pass actually makes, asserted; no target tap count is asserted anywhere.
            assertEquals("Repeating an entry must need no typing",0,repeatTyping);
            assertTrue("Repeating must not cost more taps than entering from scratch",repeatTaps<=scratchTaps);
            assertTrue("Repeating must still end at a Save the user presses",repeatTaps>=2);

            File directory=new File(activity.getExternalFilesDir(null),"evidence");
            assertTrue(directory.exists()||directory.mkdirs());
            Files.write(new File(directory,"usability-baseline.json").toPath(),new JSONObject()
                .put("measurement","Taps and typing sessions performed against the shipped UI on an Android 34 emulator.")
                .put("note","A baseline, not a target. A tap count that improves while a confirmation disappears is a regression.")
                .put("confirmation_retained",true)
                .put("tasks",tasks).toString(2).getBytes(StandardCharsets.UTF_8));
            InstrumentationRegistry.getInstrumentation().getTargetContext();
        }
    }
}

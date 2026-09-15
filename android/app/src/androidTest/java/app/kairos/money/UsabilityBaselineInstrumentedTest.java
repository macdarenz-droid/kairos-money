package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
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
 * LOW_EFFORT_USABILITY.md requires a recorded baseline before any tap-count target, because the counts in
 * LAZY_USER_SCAN.md were read from source rather than measured. This drives the shipped UI and counts every
 * tap and typing session it performs.
 *
 * It runs after other instrumented classes against the same install, so it assumes no particular starting
 * state: it uses whatever account already exists, creates its own uniquely named entry, and removes exactly
 * what it created so later classes see the database as they would have. It asserts only the claims this pass
 * makes and sets no target tap count.
 */
public class UsabilityBaselineInstrumentedTest {
    private static final String PROBE="Synthetic usability probe";
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
    private static String named(String name){
        return "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSONObject.quote(name)+")";
    }
    private static String labelled(String fragment){
        return "Array.from(document.querySelectorAll('button')).find(e=>(e.getAttribute('aria-label')||'').includes("+JSONObject.quote(fragment)+"))";
    }
    /** One tap by the user, counted. */
    private void tap(String selector) throws Exception {awaitJs("Boolean("+selector+")");js(selector+".click()");taps++;}
    /** One typing session: the keyboard appears and the user types. */
    private void type(String label,String text) throws Exception {
        String node="Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith("+JSONObject.quote(label)+"))?.querySelector('input')";
        awaitJs("Boolean("+node+")");
        js("(()=>{const i="+node+";Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,"+JSONObject.quote(text)+");i.dispatchEvent(new Event('input',{bubbles:true}));})()");
        typingSessions++;
    }
    private void unlock() throws Exception {
        awaitJs("document.body.innerText.includes('Welcome back')");type("PIN","246810");tap(named("Unlock"));
        awaitJs("Boolean(document.querySelector('nav'))");
        taps=0;typingSessions=0;   // Unlocking is not part of any measured task.
    }
    @Test public void recordingATransactionAndRepeatingItCostWhatIsMeasuredHere() throws Throwable {
        JSONArray tasks=new JSONArray();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();
            assertEquals("This baseline needs an account, which the earlier classes create.","true",
                js("document.body.innerText.includes('Accounts set up')"));

            // Task one: record an expense from scratch.
            tap(named("Add transaction"));
            type("Amount","15.00");type("Description",PROBE);
            tap(named("Save transaction"));
            awaitJs("!Boolean("+named("Save transaction")+")");
            int scratchTaps=taps,scratchTyping=typingSessions;
            tasks.put(new JSONObject().put("task","record an expense from scratch").put("taps",scratchTaps).put("typing_sessions",scratchTyping));
            assertTrue("Recording from scratch types the amount and the description",scratchTyping>=2);
            taps=0;typingSessions=0;

            // Task two: record the same expense again from its repeat tile.
            tap(labelled("Record "+PROBE));
            awaitJs("Boolean("+named("Save transaction")+")");
            tap(named("Save transaction"));
            awaitJs("!Boolean("+named("Save transaction")+")");
            int repeatTaps=taps,repeatTyping=typingSessions;
            tasks.put(new JSONObject().put("task","record the same expense again").put("taps",repeatTaps).put("typing_sessions",repeatTyping));

            // The claims this pass makes, asserted. No target tap count is asserted anywhere.
            assertEquals("Repeating an entry must need no typing",0,repeatTyping);
            assertTrue("Repeating must not cost more taps than entering from scratch",repeatTaps<=scratchTaps);
            assertTrue("Repeating must still end at a Save the user presses",repeatTaps>=2);

            File directory=new File(activity.getExternalFilesDir(null),"evidence");
            assertTrue(directory.exists()||directory.mkdirs());
            Files.write(new File(directory,"usability-baseline.json").toPath(),new JSONObject()
                .put("measurement","Taps and typing sessions performed against the shipped UI on an Android 34 emulator.")
                .put("note","A baseline, not a target. A tap count that improves while a confirmation disappears is a regression.")
                .put("confirmation_retained",true).put("tasks",tasks)
                .toString(2).getBytes(StandardCharsets.UTF_8));

            // Remove exactly what this test created, so later classes see the database as they would have.
            //
            // This is done in SQL rather than by driving the delete flow. A DOM-driven cleanup broke twice:
            // it depends on where a row renders and on which button inside it, and when it failed it failed
            // silently, leaving entries behind for the classes that run next. Manual entries are staging
            // rows marked __manual__ in a manual-entry-v1 batch, so the batches this test created are
            // identifiable by the description it typed, and removing them is exact.
            int remaining=DatabaseDigest.transaction(activity,db->{
                java.util.List<String> batches=new java.util.ArrayList<>();
                try(android.database.Cursor cursor=db.query(
                    "SELECT DISTINCT s.import_batch_id FROM staging_rows s JOIN import_batches b ON b.id=s.import_batch_id"
                    +" WHERE s.source_row_id='__manual__' AND b.parser_version='manual-entry-v1' AND s.payload LIKE ?",
                    new Object[]{"%"+PROBE+"%"})) {
                    while(cursor.moveToNext())batches.add(cursor.getString(0));
                }
                for(String batch:batches){
                    Object[] id=new Object[]{batch};
                    db.execSQL("DELETE FROM transaction_sources WHERE import_batch_id=?",id);
                    db.execSQL("DELETE FROM transactions WHERE import_batch_id=?",id);
                    db.execSQL("DELETE FROM staging_rows WHERE import_batch_id=?",id);
                    db.execSQL("DELETE FROM coverage_ranges WHERE import_batch_id=?",id);
                    db.execSQL("DELETE FROM import_batches WHERE id=?",id);
                }
                try(android.database.Cursor broken=db.query("PRAGMA foreign_key_check")){
                    if(broken.moveToFirst())throw new IllegalStateException("Baseline cleanup broke a ledger relationship");
                }
                try(android.database.Cursor left=db.query(
                    "SELECT COUNT(*) FROM staging_rows WHERE source_row_id='__manual__' AND payload LIKE ?",
                    new Object[]{"%"+PROBE+"%"})) {
                    return left.moveToFirst()?left.getInt(0):-1;
                }
            });
            assertEquals("The baseline must leave none of its own entries behind",0,remaining);
        }
    }
}

package app.kairos.money;

import static org.junit.Assert.*;
import android.os.Bundle;
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
    /** DOM facts captured the moment the repeat tile is tapped at 200% text, reported either way. */
    private String sheetState="not captured";

    private String js(String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        activity.runOnUiThread(()->activity.getBridge().getWebView().evaluateJavascript(script,r->{value.set(r);done.countDown();}));
        assertTrue("WebView did not respond",done.await(15,TimeUnit.SECONDS));return value.get();
    }
    private void awaitJs(String condition) throws Exception {awaitJs(condition,"");}
    private void awaitJs(String condition,String context) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+30000;
        while(SystemClock.elapsedRealtime()<deadline){if("true".equals(js(condition)))return;Thread.sleep(150);}
        fail("Condition never held: "+condition+(context.isEmpty()?"":"; "+context)
            +"; DOM now "+js("(()=>{const d=Array.from(document.querySelectorAll('dialog'));"
            +"return JSON.stringify({dialogs:d.length,open:d.map(x=>x.open),buttons:document.querySelectorAll('button').length});})()")
            +"; page: "+js("document.body.innerText"));
    }
    private static String named(String name){
        return "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSONObject.quote(name)+")";
    }
    private static String labelled(String fragment){
        return "Array.from(document.querySelectorAll('button')).find(e=>(e.getAttribute('aria-label')||'').includes("+JSONObject.quote(fragment)+"))";
    }
    /**
     * One tap by the user, counted — and proven to have landed.
     *
     * This used to await the selector and then click it in a second evaluation. Two evaluations race: the
     * element can be replaced between them, and `undefined.click()` throws inside evaluateJavascript, which
     * returns null and is discarded. A tap that never happened was still counted, and the run failed later
     * at whatever the tap was supposed to cause, describing a symptom several steps away from its cause.
     *
     * Finding and clicking in one evaluation removes the race, and returning whether it clicked turns a
     * silent no-op into a named failure. A cleanup that failed silently cost this test two earlier runs;
     * the same shape was still here in the tap itself.
     */
    private void tap(String selector) throws Exception {
        awaitJs("Boolean("+selector+")");
        String clicked=js("(()=>{const target="+selector+";if(!target)return false;target.click();return true;})()");
        assertEquals("Nothing was there to tap: "+selector,"true",clicked);
        taps++;
    }
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

            // Task one: record an expense from scratch.
            tap(named("Add transaction"));
            // The precondition, checked where it actually matters rather than by reading chrome off the
            // home screen: this baseline needs an account, which the earlier classes create. It used to
            // look for the words "Accounts set up", which were a count the home screen no longer carries —
            // that text was one of nineteen blocks competing with the user's own money for attention.
            assertEquals("This baseline needs an account, which the earlier classes create.","true",
                js("Boolean(Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith('Account'))"
                    +"?.querySelector('select')?.options.length)"));
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

            // Task three: the same repeat, at 200% text.
            //
            // A shortcut that only works at default text size is not a shortcut for the person who most
            // needs one. This is also where two real virtualization defects lived, so the cost of the lazy
            // path at 200% is measured rather than assumed. The zoom is restored afterwards whatever
            // happens: the classes that run next share this install.
            int zoomTaps,zoomTyping;boolean reachable;
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->
                activity.getBridge().getWebView().getSettings().setTextZoom(200));
            try {
                taps=0;typingSessions=0;
                tap(labelled("Record "+PROBE));
                // Three runs failed here, and the cause was not the text zoom this task changes — it was
                // that saving from the tile replaced the tile. The proposal was identified by whichever
                // entry represented its group, so recording the same expense again moved that identity to
                // the new entry, React rebuilt the button, and the next tap reached a node it had already
                // discarded. Reproduced in jsdom with no zoom at all; the fix is in the proposal's
                // identity, and tests/repeat-tile-identity.test.tsx holds it.
                //
                // The capture stays, because it is what finally told a closed <dialog> apart from one that
                // was never rendered, and that distinction is what ended three runs of guessing.
                sheetState=js("(()=>{const dialogs=Array.from(document.querySelectorAll('dialog'));return JSON.stringify({"
                    +"dialogs:dialogs.length,open:dialogs.map(d=>d.open),"
                    +"tile:Boolean("+labelled("Record "+PROBE)+"),"
                    +"save:Boolean("+named("Save transaction")+"),"
                    +"buttons:document.querySelectorAll('button').length,"
                    +"zoom:Math.round(window.devicePixelRatio*100)/100});})()");
                awaitJs("Boolean("+named("Save transaction")+")","after tapping the repeat tile at 200% text; DOM at tap time was "+sheetState);
                tap(named("Save transaction"));
                awaitJs("!Boolean("+named("Save transaction")+")");
                zoomTaps=taps;zoomTyping=typingSessions;
                // One-handed reach, as much of it as a program can honestly check: is the tile on screen
                // at 200% text, or does reaching the shortcut cost a scroll the tap count never shows?
                reachable="true".equals(js("(()=>{const b="+labelled("Record "+PROBE)+";if(!b)return false;"
                    +"const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=window.innerHeight;})()"));
            } finally {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(()->
                    activity.getBridge().getWebView().getSettings().setTextZoom(100));
            }
            tasks.put(new JSONObject().put("task","record the same expense again at 200% text")
                .put("taps",zoomTaps).put("typing_sessions",zoomTyping).put("tile_on_screen_without_scrolling",reachable));
            assertEquals("Repeating at 200% text must still need no typing",0,zoomTyping);
            assertEquals("Repeating must cost the same at 200% text as at default text",repeatTaps,zoomTaps);

            File directory=new File(activity.getExternalFilesDir(null),"evidence");
            assertTrue(directory.exists()||directory.mkdirs());
            // The evidence file only reaches the build artifact, which is not always retrievable, and an
            // assertion message prints only on failure. Instrumentation status is written by `am instrument`
            // on success too, so the measured figures reach the gate log where they can actually be read.
            JSONObject report=new JSONObject()
                .put("measurement","Taps and typing sessions performed against the shipped UI on an Android 34 emulator.")
                .put("note","A baseline, not a target. A tap count that improves while a confirmation disappears is a regression.")
                .put("not_measured_here","Categorising at entry. The category chips are built from the user's own filed history, and no class before this one files a categorised manual entry, so the chip row is absent on the gate's device and the only route left is a select this harness cannot press as a tap. A number measured down the fallback route would not be the number a real user with history sees.")
                .put("confirmation_retained",true).put("dom_at_200_percent_tap",sheetState).put("tasks",tasks);
            Bundle status=new Bundle();
            status.putString("stream","\nusability-baseline: "+report.toString()+"\n");
            InstrumentationRegistry.getInstrumentation().sendStatus(0,status);

            Files.write(new File(directory,"usability-baseline.json").toPath(),
                report.toString(2).getBytes(StandardCharsets.UTF_8));

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

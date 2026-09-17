package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.sqlite.db.SupportSQLiteStatement;
import android.database.Cursor;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Real encrypted storage and shipped ledger UI; the synthetic asset is test-only. */
public class LedgerPerformanceInstrumentedTest {
    private MainActivity activity;
    private final JSONArray cleanupSteps=new JSONArray();
    private String lastPhase="not started";
    /** Last renderer JS heap reading; the app process survives a renderer crash only briefly. */
    private String rendererHeap="not sampled";
    /** Time inside the sampled wait, so a last sample is not mistaken for a settled value. */
    private long sampleElapsedMs=-1;
    private String js(String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        activity.runOnUiThread(()->activity.getBridge().getWebView().evaluateJavascript(script,r->{value.set(r);done.countDown();}));
        assertTrue("Ledger WebView did not respond",done.await(15,TimeUnit.SECONDS));return value.get();
    }
    private void awaitJs(String condition) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+60000;
        while(SystemClock.elapsedRealtime()<deadline){if("true".equals(js(condition)))return;Thread.sleep(150);}
        fail("Large ledger condition: "+condition+"; page: "+js("document.body.innerText"));
    }
    /**
     * Wait for the first ledger row while sampling the renderer's JS heap.
     *
     * Collecting the fixture cut the app's Java heap to 8 MB and its RSS to 272 MB, below the run that
     * last reached this assertion, and the WebView renderer still died in this phase. So the pressure is
     * the renderer's own memory, which nothing here measured. Each sample is written to the device before
     * the next poll, because a renderer crash takes the app process with it and no assertion runs.
     */
    private void awaitSampled(String phase,String condition,JSONArray samples) throws Exception {
        long started=SystemClock.elapsedRealtime(),deadline=started+60000;
        for(int poll=0;SystemClock.elapsedRealtime()<deadline;poll++) {
            if("true".equals(js(condition)))return;
            if(poll%6==0) {
                rendererHeap=js("(()=>{const m=performance.memory;return m?{used:m.usedJSHeapSize,total:m.totalJSHeapSize,limit:m.jsHeapSizeLimit}:null;})()");
                sampleElapsedMs=SystemClock.elapsedRealtime()-started;
                checkpoint(phase,samples,null);
            }
            Thread.sleep(150);
        }
        fail(phase+" never completed: "+condition+"; last renderer heap "+rendererHeap);
    }
    private void click(String name) throws Exception {
        String button="Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSONObject.quote(name)+")";
        awaitJs("Boolean("+button+")");js(button+".click()");
    }
    private void input(String label,String text) throws Exception {
        String node="Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith("+JSONObject.quote(label)+"))?.querySelector('input')";
        awaitJs("Boolean("+node+")");
        js("(()=>{const i="+node+";Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,"+JSONObject.quote(text)+");i.dispatchEvent(new Event('input',{bubbles:true}));})()");
    }
    private void unlock() throws Exception {
        awaitJs("document.body.innerText.includes('Welcome back')");input("PIN","246810");click("Unlock");awaitJs("Boolean(document.querySelector('nav'))");
    }
    private void fixture(JSONObject doc,JSONArray ledger) throws Exception {
        DatabaseDigest.transaction(activity,db->{
            String batch=doc.getString("id");
            db.execSQL("INSERT INTO accounts(id,name,institution,type,currency,opening_balance_minor) VALUES('native-performance','Synthetic performance only','Synthetic','checking','AUD',0)");
            db.execSQL("INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,stated_opening_minor,stated_closing_minor,created_at,integrity_tier,source_rank) VALUES(?,'native-performance',?,'Synthetic performance.csv','native-performance-only','2026-01-01','2026-12-31','committed',0,-20000000,'2026-12-31','C',3)",new Object[]{batch,doc.getString("hash")});
            db.execSQL("INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,'__document__',?,10000,'[]')",new Object[]{batch+"-document",batch,doc.toString()});
            try(SupportSQLiteStatement transaction=db.compileStatement("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,type,fingerprint,import_batch_id,confidence,status) VALUES(?,'native-performance',?,-1000,'AUD',?,'debit',?,?,10000,'settled')");
                SupportSQLiteStatement source=db.compileStatement("INSERT INTO transaction_sources VALUES(?,?,?,?)");
                SupportSQLiteStatement staged=db.compileStatement("INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,10000,'[]')")) {
                for(int i=0;i<ledger.length();i++) {
                    JSONObject row=ledger.getJSONObject(i);String id=row.getString("id"),rowId=row.getString("sourceId"),payload=row.toString();
                    transaction.bindString(1,id);transaction.bindString(2,row.getString("date"));transaction.bindString(3,row.getString("description"));transaction.bindString(4,row.getString("fingerprint"));transaction.bindString(5,batch);transaction.executeInsert();
                    source.bindString(1,id);source.bindString(2,batch);source.bindString(3,rowId);source.bindString(4,payload);source.executeInsert();
                    staged.bindString(1,batch+"-"+rowId);staged.bindString(2,batch);staged.bindString(3,rowId);staged.bindString(4,payload);staged.executeInsert();
                }
            }
            try(Cursor count=db.query("SELECT COUNT(*) FROM transactions t JOIN transaction_sources s ON s.transaction_id=t.id WHERE t.account_id='native-performance'")) {
                assertTrue(count.moveToFirst());assertEquals(20000,count.getInt(0));
            }
            return null;
        });
    }
    private String loadAndSeedFixture() throws Exception {
        JSONObject fixture;
        try(InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("generated/performance-ledger.json")) {
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] block=new byte[8192];int count;
            while((count=input.read(block))!=-1)bytes.write(block,0,count);
            fixture=new JSONObject(bytes.toString("UTF-8"));
        }
        JSONObject doc=fixture.getJSONObject("document");JSONArray ledger=fixture.getJSONArray("ledger");
        assertEquals(20000,ledger.length());
        fixture(doc,ledger);
        return doc.getString("id");
    }
    private void checkpoint(String phase,JSONArray samples,Throwable error) throws Exception {
        lastPhase=phase;
        File directory=new File(activity.getExternalFilesDir(null),"evidence");assertTrue(directory.exists()||directory.mkdirs());
        // The fixture is parsed inside the app process, so its Java objects compete with the WebView
        // renderer for device memory. A renderer crash during "ledger load" recorded 172 MB of a 192 MB
        // heap here and 418 MB process RSS, so collect before each phase and report both figures: a
        // large drop means the fixture was collectable garbage, a small one means it is still retained.
        Runtime runtime=Runtime.getRuntime();
        long retained=runtime.totalMemory()-runtime.freeMemory();
        runtime.gc();
        JSONObject report=new JSONObject().put("phase",phase).put("samples",samples)
            .put("cleanup",cleanupSteps)
            .put("java_heap_used_bytes",retained)
            .put("java_heap_after_gc_bytes",runtime.totalMemory()-runtime.freeMemory())
            .put("java_heap_max_bytes",runtime.maxMemory())
            .put("renderer_js_heap",rendererHeap).put("sample_elapsed_ms",sampleElapsedMs);
        if(error!=null){java.io.StringWriter trace=new java.io.StringWriter();error.printStackTrace(new java.io.PrintWriter(trace));report.put("failure",trace.toString());}
        Files.write(new File(directory,"ledger-20000-progress.json").toPath(),report.toString(2).getBytes(StandardCharsets.UTF_8));
    }
    private void removeFixture(String batch,JSONArray samples) throws Exception {
        // Keep each test-only write bounded on encrypted mobile storage. Do not
        // hold one transaction across all 60,001 rows or increase its 30s limit.
        String[][] tables={{"transaction_sources","import_batch_id"},{"transactions","account_id"},{"staging_rows","import_batch_id"}};
        for(String[] table:tables) {
            String name=table[0],column=table[1],value=column.equals("account_id")?"native-performance":batch;
            int removed=0;
            while(true) {
                String phase="cleanup "+name+" after "+removed+" rows";
                checkpoint(phase,samples,null);
                long started=SystemClock.elapsedRealtime();
                int count=DatabaseDigest.transaction(activity,db->{
                    db.execSQL("DELETE FROM "+name+" WHERE rowid IN (SELECT rowid FROM "+name+" WHERE "+column+"=? LIMIT 256)",new Object[]{value});
                    try(Cursor changed=db.query("SELECT changes()")){if(!changed.moveToFirst())throw new IllegalStateException("Missing fixture cleanup count");return changed.getInt(0);}
                });
                cleanupSteps.put(new JSONObject().put("table",name).put("rows",count).put("elapsed_ms",SystemClock.elapsedRealtime()-started));
                assertTrue("Fixture cleanup exceeded its batch bound",count>=0&&count<=256);
                removed+=count;
                if(count<256)break;
            }
            assertEquals("Fixture row count changed before cleanup: "+name,name.equals("staging_rows")?20001:20000,removed);
        }
        checkpoint("cleanup account",samples,null);
        DatabaseDigest.transaction(activity,db->{
            db.execSQL("DELETE FROM import_batches WHERE id=?",new Object[]{batch});
            db.execSQL("DELETE FROM accounts WHERE id='native-performance'");
            try(Cursor broken=db.query("PRAGMA foreign_key_check")){if(broken.moveToFirst())throw new IllegalStateException("Fixture cleanup broke a ledger relationship");}
            return null;
        });
    }
    @Test public void twentyThousandSourceRowsScrollAtNormalAndLargeText() throws Throwable {
        JSONArray samples=new JSONArray();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();click("You");new BackupTestUi(activity).ready();
            long before=DatabaseDigest.userRows(activity);String batchId=null;Throwable primary=null;String phase="seed";
            try {
                checkpoint(phase,samples,null);
                // The parsed document AND reconciled rows must leave the Java stack before
                // measuring the app. Keeping them here pins tens of MB in the app's test process.
                batchId=loadAndSeedFixture();phase="recreate";checkpoint(phase,samples,null);
                scenario.recreate();scenario.onActivity(a->activity=a);unlock();
                phase="ledger load";checkpoint(phase,samples,null);
                // Split the load so the evidence says where the time goes: opening the tab, the first
                // row reaching the DOM (data read and transferred), then searching across all twenty thousand.
                js("window.__kairosQueries&&window.__kairosQueries.reset()");
                long started=SystemClock.elapsedRealtime();click("Ledger");
                long tabMs=SystemClock.elapsedRealtime()-started;
                awaitSampled("ledger first row","Boolean(document.querySelector('button.transaction-row'))",samples);
                long firstRowMs=SystemClock.elapsedRealtime()-started;
                // Which statements the device actually spent that time in. Shapes only, no values.
                String profile=js("JSON.stringify((window.__kairosQueries&&window.__kairosQueries.read(5))||[])");
                checkpoint("ledger search entry",samples,null);
                input("Search history","Synthetic performance merchant");
                long searchMs=SystemClock.elapsedRealtime()-started;
                // The measured window continues past the first row, so keep sampling: a crash after this
                // point would otherwise be reported with a heap reading taken before the search ran.
                awaitSampled("ledger search","document.body.innerText.includes('20000 transactions')",samples);
                long loadMs=SystemClock.elapsedRealtime()-started;
                for(int zoom:new int[]{100,200}) {
                    phase="page text "+zoom;checkpoint(phase,samples,null);
                    InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().getSettings().setTextZoom(zoom));
                    // HISTORY LOADS MORE NOW, NOT PAGES, AND NEVER VIRTUALIZED. There is no scroller to
                    // fling and no runaway list: every press adds exactly one page of rows and nothing else
                    // is ever mounted, so the guarantee is arithmetic rather than a ceiling somebody chose.
                    // What is worth measuring is what a person actually does to it — ask for more, and search.
                    js("(()=>{const h=Array.from(document.querySelectorAll('h2')).find(e=>e.textContent.trim()==='History');h&&h.scrollIntoView({behavior:'instant',block:'start'});})()");
                    awaitJs("Boolean(document.querySelector('button.transaction-row'))");
                    NativeEvidence.capture(activity,"ledger-20000-text-"+zoom+"-start");
                    js("(()=>{window.__ledgerFrames=null;const frames=[];let previous=null,n=0,maxRows=0,loaded=0;"
                      +"const rows=()=>document.querySelectorAll('button.transaction-row').length;const start=rows();"
                      +"const more=()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Load more');"
                      +"function step(now){if(previous!==null)frames.push(now-previous);previous=now;"
                      +"maxRows=Math.max(maxRows,rows());"
                      +"if(n%10===0){const b=more();if(b&&!b.disabled){b.click();loaded++;}}"
                      +"if(++n<121)requestAnimationFrame(step);"
                      +"else window.__ledgerFrames={frame_intervals_ms:frames,max_mounted_rows:maxRows,pages_loaded:loaded,rows_at_start:start};}"
                      +"requestAnimationFrame(step);})()");
                    awaitJs("Boolean(window.__ledgerFrames)");JSONObject sample=new JSONObject(js("window.__ledgerFrames"));
                    // Twenty thousand rows exist; what is mounted is exactly what was asked for, one page
                    // per press and not a row more — ten of them, the PAGE constant this list is built on.
                    // That is the same promise the five-row page made, stated as the arithmetic it now is.
                    //
                    // MEASURED FROM WHAT WAS ALREADY THERE, which the first version of this got wrong and
                    // the device caught: "250 > 150". The second text size runs against the same cached
                    // query as the first, so the list opens holding every page the earlier pass asked for —
                    // that is the point of load-more, what has been read stays read. The claim is the
                    // GROWTH: a press adds one page, and nothing mounts that nobody asked for.
                    int asked=sample.getInt("rows_at_start")+10*sample.getInt("pages_loaded");   // PAGE in ImportWorkspace.tsx
                    assertTrue("History mounted more rows than were asked for: "+sample.getInt("max_mounted_rows")+" > "+asked,
                        sample.getInt("max_mounted_rows")<=asked);
                    assertTrue("History did not load more",sample.getInt("pages_loaded")>0);
                    // THE FAR END, REACHED ON PURPOSE rather than inferred from a short burst of Next. Turning
                    // pages five at a time cannot walk across twenty thousand rows, and searching is how this
                    // list is navigated now — so the claim under test is that the fixture's LAST row is
                    // reachable at all. That is a claim about the query rather than about scrolling, which is
                    // the stronger of the two: the old test scrolled to display position 20,000, which is not
                    // the same row and proves nothing about reaching a particular one.
                    input("Search history","merchant EOBP");
                    awaitJs("document.querySelectorAll('button.transaction-row').length===1"
                      +" && document.querySelector('button.transaction-row').textContent.toUpperCase().includes('MERCHANT EOBP')");
                    assertEquals("1",js("document.querySelectorAll('button.transaction-row').length"));
                    // Scoped to a row, as the old check was scoped to the list. At 200% text a row that
                    // cannot fit its own width is the failure this catches; widening it to the whole page
                    // would fail on any other screen's layout and say nothing about History.
                    assertEquals("false",js("(()=>{const r=document.querySelector('button.transaction-row');return r.scrollWidth>r.clientWidth+1})()"));
                    NativeEvidence.capture(activity,"ledger-20000-text-"+zoom+"-end");
                    samples.put(sample.put("text_zoom",zoom).put("reached_last_row",true));
                    // Put the whole ledger back, so the next text size starts where this one did.
                    input("Search history","Synthetic performance merchant");
                    awaitJs("document.body.innerText.includes('20000 transactions')");
                }
                File directory=new File(activity.getExternalFilesDir(null),"evidence");assertTrue(directory.exists()||directory.mkdirs());
                Files.write(new File(directory,"ledger-20000.json").toPath(),new JSONObject().put("rows",20000).put("source_links",20000).put("ledger_load_ms",loadMs).put("ledger_load_budget_ms",10000)
                    .put("tab_open_ms",tabMs).put("first_row_ms",firstRowMs).put("search_entered_ms",searchMs).put("samples",samples).put("measurement","WebView requestAnimationFrame intervals during programmatic scroll on Android; raw timings require performance review, not a physical-device FPS claim.").toString(2).getBytes(StandardCharsets.UTF_8));
                // Phase timings ride the assertion message: the evidence directory is on the device and the
                // gate only pulls it after every class passes, so on failure it is lost with the emulator.
                assertTrue("20,000-row ledger took "+loadMs+" ms; budget is 10000 ms"
                    +" [tab_open="+tabMs+" ms, first_row="+firstRowMs+" ms, search_entered="+searchMs+" ms]"
                    +" renderer_heap="+rendererHeap
                    +" slowest="+profile,loadMs<10000);
            } catch(Throwable error) {
                primary=error;
                android.util.Log.e("KairosPerformance","Failure during "+phase,error);
                try{checkpoint(phase,samples,error);}catch(Throwable reporting){error.addSuppressed(reporting);}
                throw error;
            } finally {
                try {
                    InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().getSettings().setTextZoom(100));
                    if(batchId!=null) {
                        phase="cleanup";
                        removeFixture(batchId,samples);
                        assertEquals("Performance fixture left user records behind",before,DatabaseDigest.userRows(activity));
                        checkpoint("complete",samples,null);
                    }
                } catch(Throwable cleanup) {
                    if(primary==null){
                        android.util.Log.e("KairosPerformance","Cleanup failed",cleanup);
                        // Retain the last per-table phase rather than replacing it.
                        try{checkpoint(lastPhase,samples,cleanup);}catch(Throwable reporting){cleanup.addSuppressed(reporting);}
                        throw cleanup;
                    }
                    primary.addSuppressed(cleanup);
                    android.util.Log.e("KairosPerformance","Cleanup also failed; original failure retained",cleanup);
                    try{checkpoint(phase,samples,primary);}catch(Throwable reporting){primary.addSuppressed(reporting);}
                }
            }
        }
    }
}

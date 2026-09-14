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
    @Test public void twentyThousandSourceRowsScrollAtNormalAndLargeText() throws Exception {
        JSONObject fixture;
        try(InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("generated/performance-ledger.json")) {
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] block=new byte[8192];int count;
            while((count=input.read(block))!=-1)bytes.write(block,0,count);
            fixture=new JSONObject(bytes.toString("UTF-8"));
        }
        JSONObject doc=fixture.getJSONObject("document");JSONArray ledger=fixture.getJSONArray("ledger"),samples=new JSONArray();
        assertEquals(20000,ledger.length());
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();click("You");new BackupTestUi(activity).ready();
            long before=DatabaseDigest.userRows(activity);boolean seeded=false;
            try {
                fixture(doc,ledger);seeded=true;
                scenario.recreate();scenario.onActivity(a->activity=a);unlock();
                long started=SystemClock.elapsedRealtime();click("Ledger");input("Search transactions","Synthetic performance merchant");
                awaitJs("document.querySelector('.windowed-list [role=listitem]')?.getAttribute('aria-setsize')==='20000'");
                long loadMs=SystemClock.elapsedRealtime()-started;
                for(int zoom:new int[]{100,200}) {
                    InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().getSettings().setTextZoom(zoom));
                    js("(()=>{const list=document.querySelector('.windowed-list');list.scrollTop=0;list.scrollIntoView({behavior:'instant',block:'start'});})()");
                    awaitJs("Boolean(document.querySelector('.windowed-list [aria-posinset=\"1\"]'))");
                    NativeEvidence.capture(activity,"ledger-20000-text-"+zoom+"-start");
                    js("(()=>{window.__ledgerFrames=null;const list=document.querySelector('.windowed-list'),frames=[];let previous=null,n=0,maxRows=0;function step(now){if(previous!==null)frames.push(now-previous);previous=now;maxRows=Math.max(maxRows,list.querySelectorAll('[role=listitem]').length);list.scrollTop+=list.clientHeight/3;if(++n<121)requestAnimationFrame(step);else window.__ledgerFrames={frame_intervals_ms:frames,max_mounted_rows:maxRows,scroll_top:list.scrollTop};}requestAnimationFrame(step);})()");
                    awaitJs("Boolean(window.__ledgerFrames)");JSONObject sample=new JSONObject(js("window.__ledgerFrames"));
                    assertTrue("Virtualization mounted too many rows",sample.getInt("max_mounted_rows")<=40);
                    assertTrue("List did not scroll",sample.getDouble("scroll_top")>0);
                    // Visit middle and final rows separately; end-to-end reachability is not inferred from a small fling.
                    js("(()=>{const l=document.querySelector('.windowed-list');l.scrollTop=l.scrollHeight/2;})()");
                    awaitJs("Array.from(document.querySelectorAll('.windowed-list [role=listitem]')).some(e=>Number(e.getAttribute('aria-posinset'))>9000)");
                    js("(()=>{const l=document.querySelector('.windowed-list');l.scrollTop=l.scrollHeight;})()");
                    awaitJs("Boolean(document.querySelector('.windowed-list [aria-posinset=\"20000\"]'))");
                    assertTrue(Integer.parseInt(js("document.querySelectorAll('.windowed-list [role=listitem]').length"))<=40);
                    assertEquals("false",js("(()=>{const l=document.querySelector('.windowed-list');return l.scrollWidth>l.clientWidth+1})()"));
                    NativeEvidence.capture(activity,"ledger-20000-text-"+zoom+"-end");
                    samples.put(sample.put("text_zoom",zoom).put("reached_last_row",true));
                }
                File directory=new File(activity.getExternalFilesDir(null),"evidence");assertTrue(directory.exists()||directory.mkdirs());
                Files.write(new File(directory,"ledger-20000.json").toPath(),new JSONObject().put("rows",20000).put("source_links",20000).put("ledger_load_ms",loadMs).put("samples",samples).put("measurement","WebView requestAnimationFrame intervals during programmatic scroll on Android; raw timings require performance review, not a physical-device FPS claim.").toString(2).getBytes(StandardCharsets.UTF_8));
            } finally {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().getSettings().setTextZoom(100));
                if(seeded) {
                    DatabaseDigest.transaction(activity,db->{
                        String batch=doc.getString("id");
                        db.execSQL("DELETE FROM transaction_sources WHERE import_batch_id=?",new Object[]{batch});
                        db.execSQL("DELETE FROM transactions WHERE account_id='native-performance'");
                        db.execSQL("DELETE FROM staging_rows WHERE import_batch_id=?",new Object[]{batch});
                        db.execSQL("DELETE FROM import_batches WHERE id=?",new Object[]{batch});
                        db.execSQL("DELETE FROM accounts WHERE id='native-performance'");return null;
                    });
                    assertEquals("Performance fixture left user records behind",before,DatabaseDigest.userRows(activity));
                }
            }
        }
    }
}

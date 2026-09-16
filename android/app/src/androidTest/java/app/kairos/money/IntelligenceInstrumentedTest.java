package app.kairos.money;

import static org.junit.Assert.*;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.provider.MediaStore;
import android.graphics.Rect;
import android.os.SystemClock;
import android.util.Base64;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class IntelligenceInstrumentedTest {
    private MainActivity activity;
    private final Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private String js(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView did not respond", latch.await(15, TimeUnit.SECONDS)); return result.get();
    }
    private void awaitJs(String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 60000;
        while (System.currentTimeMillis() < deadline) { if ("true".equals(js(condition))) return; Thread.sleep(150); }
        fail("Import UI condition failed: " + condition + "; page: " + js("document.body.innerText"));
    }
    private void click(String name) throws Exception {
        String button = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + JSONObject.quote(name) + ")";
        awaitJs("Boolean(" + button + ")"); js(button + ".click()");
    }
    /** Wait for the target to remain visible across frames, including asynchronous layout. */
    private void captureHeading(String heading, String name) throws Exception {
        String element = "Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')).find(e=>e.textContent.trim()===" + JSONObject.quote(heading) + ")";
        awaitJs("Boolean(" + element + ")");
        String visible = "(()=>{const e=" + element + ";if(!e)return false;const r=e.getBoundingClientRect();const nav=document.querySelector('nav');const bottom=nav?nav.getBoundingClientRect().top:innerHeight;return r.top>=0 && r.bottom<bottom;})()";
        NativeEvidence.capture(activity, name, () -> {
            js(element + ".scrollIntoView({behavior:'instant',block:'start'})");
            long deadline = System.currentTimeMillis() + 15000;
            int stable = 0;
            while (System.currentTimeMillis() < deadline && stable < 4) {
                if ("true".equals(js(visible))) stable++;
                else { stable = 0; js(element + ".scrollIntoView({behavior:'instant',block:'start'})"); }
                Thread.sleep(150);
            }
            assertEquals("Heading must remain visible before capture: " + heading, 4, stable);
        }, () -> assertEquals("Heading moved during capture: " + heading, "true", js(visible)));
    }

    private void input(String label, String value) throws Exception {
        awaitJs("Array.from(document.querySelectorAll('label')).some(x=>x.textContent.startsWith(" + JSONObject.quote(label) + ") && x.querySelector('input'))");
        String script = "(()=>{const l=Array.from(document.querySelectorAll('label')).find(x=>x.textContent.startsWith(" + JSONObject.quote(label) + "));const i=l.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i," + JSONObject.quote(value) + ");i.dispatchEvent(new Event('input',{bubbles:true}));})()";
        js(script);
    }
    private void unlock() throws Exception { awaitJs("document.body.innerText.includes('Welcome back') || Boolean(document.querySelector('nav'))"); if("true".equals(js("document.body.innerText.includes('Welcome back')"))){input("PIN","246810");click("Unlock");}awaitJs("Boolean(document.querySelector('nav'))"); }
    private byte[] asset(String name) throws Exception {
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name); ByteArrayOutputStream output = new ByteArrayOutputStream()) { byte[] block = new byte[8192]; int n; while ((n = input.read(block)) != -1) output.write(block, 0, n); return output.toByteArray(); }
    }
    private void evidence(String name, String content) throws Exception {
        File directory = new File(activity.getExternalFilesDir(null), "evidence");
        assertTrue(directory.exists() || directory.mkdirs());
        try (FileOutputStream output = new FileOutputStream(new File(directory, name))) { output.write(content.getBytes(StandardCharsets.UTF_8)); }
    }
    private String hierarchy(AccessibilityNodeInfo node) {
        if (node == null) return "No active window\n";
        StringBuilder result = new StringBuilder().append(node.getPackageName()).append(" | ").append(node.getClassName()).append(" | ").append(node.getText()).append(" | ").append(node.getContentDescription()).append(" | clickable=").append(node.isClickable()).append(" | id=").append(node.getViewIdResourceName()).append('\n');
        for (int i = 0; i < node.getChildCount(); i++) result.append(hierarchy(node.getChild(i)));
        return result.toString();
    }
    private boolean clickDocument(AccessibilityNodeInfo node, String name) {
        if (node == null) return false;
        CharSequence text = node.getText(); CharSequence description = node.getContentDescription();
        if ((text != null && text.toString().equals(name)) || (description != null && description.toString().equals(name))) {
            if (!node.isVisibleToUser() || !node.isEnabled()) return false;
            AccessibilityNodeInfo action = node;
            while (action != null) {
                if (action.isClickable() && action.isEnabled() && action.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                action = action.getParent();
            }
            Rect bounds = new Rect(); node.getBoundsInScreen(bounds); if (bounds.isEmpty()) return false;
            long time = SystemClock.uptimeMillis();
            MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, bounds.centerX(), bounds.centerY(), 0);
            MotionEvent up = MotionEvent.obtain(time, time + 50, MotionEvent.ACTION_UP, bounds.centerX(), bounds.centerY(), 0);
            down.setSource(InputDevice.SOURCE_TOUCHSCREEN); up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try {
                boolean pressed = InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(down, true);
                return InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(up, true) && pressed;
            } finally { down.recycle(); up.recycle(); }
        }
        for (int i = 0; i < node.getChildCount(); i++) if (clickDocument(node.getChild(i), name)) return true;
        return false;
    }

    private void choose(String name) throws Exception {
        click("Import statements");
        try { InstrumentationRegistry.getInstrumentation().getUiAutomation().waitForIdle(1000,10000); } catch(java.util.concurrent.TimeoutException ignored) {}
        long deadline=System.currentTimeMillis()+30000; boolean picked=false;
        while(System.currentTimeMillis()<deadline) {
            AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(picked && root!=null && "app.kairos.money".contentEquals(root.getPackageName())) return;
            if(!clickDocument(root,"Open") && !clickDocument(root,"OPEN")) picked=clickDocument(root,name)||picked;
            Thread.sleep(300);
        }
        evidence("revision-picker.txt",hierarchy(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow()));
        fail("Revision file picker did not return");
    }
    private Uri download(String name,String csv) throws Exception {
        ContentValues values=new ContentValues(); values.put(MediaStore.Downloads.DISPLAY_NAME,name);values.put(MediaStore.Downloads.MIME_TYPE,"text/csv");values.put(MediaStore.Downloads.RELATIVE_PATH,"Download");
        Uri uri=target.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);assertNotNull(uri);
        try(OutputStream out=target.getContentResolver().openOutputStream(uri)){assertNotNull(out);out.write(csv.getBytes(StandardCharsets.UTF_8));}return uri;
    }
    private void seed(int count, boolean low) throws Exception {
        new BackupTestUi(activity).ready();
        click("You");
        DatabaseDigest.transaction(activity, db -> {
            String end=java.time.LocalDate.now().toString(),start=java.time.LocalDate.now().minusDays(count-1).toString();
            db.execSQL("INSERT OR IGNORE INTO accounts(id,name,institution,type,currency,opening_balance_minor) VALUES('s3','Synthetic intelligence','Test','checking','USD',0)");
            db.execSQL("INSERT OR IGNORE INTO categories(id,name,kind) VALUES('s3-essential','Synthetic essentials','essential')");
            db.execSQL("INSERT OR IGNORE INTO categories(id,name,kind) VALUES('s3-disc','Synthetic discretionary','discretionary')");
            db.execSQL("INSERT OR IGNORE INTO categories(id,name,kind) VALUES('s3-income','Synthetic income','income')");
            db.execSQL("INSERT OR REPLACE INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,stated_opening_minor,stated_closing_minor,created_at,integrity_tier,source_rank) VALUES('s3-batch','s3','s3-fixture','Synthetic six month source.csv','native-fixture',?,?,'committed',0,?,?,'A',3)",new Object[]{start,end,low?1000:100000,end});
            db.execSQL("INSERT OR REPLACE INTO coverage_ranges VALUES('s3-coverage','s3',?,?,'s3-batch')",new Object[]{start,end});
            JSONObject metadata=new JSONObject();
            for(int i=0;i<count;i++) {
                String date=java.time.LocalDate.parse(start).plusDays(i).toString();
                for(String kind:new String[]{"essential","disc"}){
                    String id="s3-"+date+"-"+kind; int amount=kind.equals("essential")?-1000:-500;
                    db.execSQL("INSERT OR IGNORE INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes,status) VALUES(?,'s3',?,?,'USD',?,?,'debit',0,?,'s3-batch',10000,1,'','settled')",new Object[]{id,date,amount,"Synthetic "+kind+" "+date,"s3-"+kind,id});
                    db.execSQL("INSERT OR IGNORE INTO transaction_sources VALUES(?,'s3-batch',?,?)",new Object[]{id,id,"Synthetic instrumented source: "+date+" "+amount});
                    metadata.put(id,new JSONObject().put("instrument","card"));
                }
                if(i%14==0){String id="s3-pay-"+date;
                    db.execSQL("INSERT OR IGNORE INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes,status) VALUES(?,'s3',?,100000,'USD','Synthetic pay','s3-income','credit',0,?,'s3-batch',10000,1,'','settled')",new Object[]{id,date,id});
                    db.execSQL("INSERT OR IGNORE INTO payslips(id,employer,pay_date,period_start,period_end,gross_minor,net_minor,tax_minor,super_minor,deductions,allowances,ytd,currency,linked_transaction_id,import_batch_id) VALUES(?,'Synthetic employer',?,?,?,130000,100000,30000,0,'[]','[]','{}','USD',?,'s3-batch')",new Object[]{id,date,java.time.LocalDate.parse(date).minusDays(13).toString(),date,id});
                }
            }
            db.execSQL("INSERT OR REPLACE INTO app_settings VALUES('intelligence:metadata',?)",new Object[]{metadata.toString()});
            return null;
        });
    }
    @Test public void b_manualEntryAndThemes() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();
            for(String theme:new String[]{"Light","Dark"}) {
                click("You");click(theme);click("Today");click("Add transaction");
                input("Amount","12.50");input("Description","Synthetic manual purchase "+theme);
                NativeEvidence.capture(activity,theme.toLowerCase()+"-manual-entry");click("Save transaction");
                awaitJs("!document.querySelector('dialog')");click("Ledger");
                awaitJs("document.body.innerText.includes('Synthetic manual purchase "+theme+"')");
                captureHeading("Manual transactions",theme.toLowerCase()+"-manual-history");click("Edit");input("Amount","15.00");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-manual-edit");click("Save transaction");awaitJs("!document.querySelector('dialog')");
                js("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Split expense categories').click()");
                click("Split this expense");input("Amount 1","10.00");input("Amount 2","5.00");click("Save category split");
                awaitJs("[...document.querySelectorAll('button')].some(e=>e.textContent==='Edit category split')");
                captureHeading("Category split",theme.toLowerCase()+"-manual-category-split");
                click("Remove split");click("Confirm remove split");
                awaitJs("[...document.querySelectorAll('button')].some(e=>e.textContent==='Split this expense')");
                click("Match with statement");awaitJs("document.body.innerText.includes('No imported entry with the same account')");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-manual-match");js("document.querySelector('dialog .icon-button').click()");
                click("Delete");NativeEvidence.capture(activity,theme.toLowerCase()+"-manual-delete");click("Delete transaction");
                awaitJs("!document.querySelector('dialog') && !document.body.innerText.includes('Synthetic manual purchase "+theme+"')");
            }
        }
    }
    @Test public void c_monthlyVisualEvidence() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();
            // Reuse settled source rows: preserve amounts, coverage and existing profile assertions.
            click("Ledger");
            DatabaseDigest.transaction(activity, db -> {
                for (int offset : new int[]{28,14,0}) {
                    String id = "s3-" + java.time.LocalDate.now().minusDays(offset) + "-essential";
                    android.content.ContentValues values = new android.content.ContentValues();
                    values.put("raw_description", "Synthetic fortnightly membership");
                    assertEquals("Recurring fixture requires an existing settled source row", 1,
                        db.update("transactions", android.database.sqlite.SQLiteDatabase.CONFLICT_NONE, values, "id=?", new Object[]{id}));
                }
                return null;
            });
            for(String theme:new String[]{"Light","Dark"}) {
                click("You");click(theme);awaitJs("Boolean(document.querySelector('.money-visuals select'))");
                js("(()=>{const e=document.querySelector('.money-visuals select');e.value='USD';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
                // Net worth has its own currency filter; the reconciled fixture is USD.
                js("(()=>{const e=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith('Net worth currency')).querySelector('select');e.value='USD';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
                awaitJs("Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith('Net worth currency')).querySelector('select').value==='USD'");
                awaitJs("Boolean(document.querySelector('.fingerprint'))");
                for(String heading:new String[]{"Money Fingerprint","Daily cashflow","Spending after payday","Recurring payment timeline","Spending by category","What changed","Recurring costs","Upcoming bills","Merchant history","Recorded net worth"}) {
                    if (heading.equals("Recurring payment timeline")) {
                        awaitJs("Array.from(document.querySelectorAll('[aria-label]')).some(e=>e.getAttribute('aria-label').startsWith('synthetic fortnightly membership:') && e.querySelectorAll('circle').length>0)");
                    }
                    captureHeading(heading,theme.toLowerCase()+"-monthly-"+heading.toLowerCase().replace(' ','-'));
                }
                click("Record cancellation · synthetic fortnightly membership");
                input("Contact or confirmation date",java.time.LocalDate.now().minusDays(1).toString());
                NativeEvidence.capture(activity,theme.toLowerCase()+"-cancellation-entry");click("Save cancellation record");
                awaitJs("!document.querySelector('dialog') && document.body.innerText.includes('Cancellation requested')");
                click("Review 1 later payment");awaitJs("Boolean(document.querySelector('dialog')) && document.body.innerText.includes('These may be final charges')");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-cancellation-later-payment");js("document.querySelector('dialog .icon-button').click()");
                click("Remove record");click("Remove cancellation record");awaitJs("!document.querySelector('dialog') && document.body.innerText.includes('No cancellation records in USD.')");
                js("(()=>{const e=document.querySelector('.money-visuals input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
                awaitJs("document.querySelector('.money-visuals input[type=range]').value==='1'");
                js("document.querySelector('.money-visuals').scrollIntoView()");NativeEvidence.capture(activity,theme.toLowerCase()+"-monthly-comparison");
                click("Record a value");input("Item name","Synthetic valuation "+theme);input("Valuation date","2026-01-01");input("Positive value or amount owed","12000.00");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-valuation-entry");click("Save value");awaitJs("!document.querySelector('dialog') && document.body.innerText.includes('Latest manual total')");
                awaitJs("document.body.innerText.includes('One valuation date recorded')");
                captureHeading("Recorded net worth",theme.toLowerCase()+"-valuation-history");
                click("Record a value");
                js("(()=>{const e=document.querySelector('dialog select');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
                input("Valuation date","2026-02-01");input("Positive value or amount owed","12500.00");click("Save value");
                awaitJs("!document.querySelector('dialog') && Boolean(document.querySelector('svg[aria-label^=\"Recorded net worth\"]')) && !document.body.innerText.includes('One valuation date recorded')");
                captureHeading("Recorded net worth",theme.toLowerCase()+"-valuation-two-dates");
                js("Array.from(document.querySelectorAll('summary')).find(e=>e.textContent==='Manage recorded values').click()");click("Remove");click("Remove value");awaitJs("!document.querySelector('dialog') && document.body.innerText.includes('One valuation date recorded')");
                js("Array.from(document.querySelectorAll('summary')).find(e=>e.textContent==='Manage recorded values').parentElement.open=true");click("Remove");click("Remove value");awaitJs("!document.querySelector('dialog') && !document.body.innerText.includes('Synthetic valuation "+theme+"')");
                js("Array.from(document.querySelectorAll('summary')).find(e=>e.textContent==='Imported account ownership').parentElement.open=true");
                awaitJs("document.body.innerText.includes('Latest reconciled statement closing balance')");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-net-worth-account-ownership");
                js("(()=>{const d=Array.from(document.querySelectorAll('details')).find(e=>e.querySelector('summary')?.textContent==='Imported account ownership');const b=Array.from(d.querySelectorAll('button')).find(e=>e.textContent==='Include balance'&&!e.disabled);if(!b)throw new Error('No verified account balance');b.click();})()");
                awaitJs("Array.from(document.querySelectorAll('details')).find(e=>e.querySelector('summary')?.textContent==='Imported account ownership').innerText.includes(' · included')");captureHeading("Combined position",theme.toLowerCase()+"-net-worth-combined");
                js("(()=>{const d=Array.from(document.querySelectorAll('details')).find(e=>e.querySelector('summary')?.textContent==='Imported account ownership');Array.from(d.querySelectorAll('button')).find(e=>e.textContent==='Exclude balance').click();})()");
                awaitJs("Array.from(document.querySelectorAll('details')).find(e=>e.querySelector('summary')?.textContent==='Imported account ownership').innerText.includes(' · excluded')");
                click("Ledger");click("Change categories");awaitJs("Boolean(document.querySelector('dialog input[type=checkbox]'))");
                js("document.querySelector('dialog input[type=checkbox]').click()");NativeEvidence.capture(activity,theme.toLowerCase()+"-bulk-categories");
                js("document.querySelector('dialog .icon-button').click()");
            }
        }
    }
    @Test public void d_spendingPatternsEvidence() throws Exception {
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName(),android.Manifest.permission.CAMERA);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();
            for(String theme:new String[]{"Light","Dark"}) {
                click("You");click(theme);click("Insights");
                awaitJs("Boolean(document.querySelector('.spending-patterns select'))");
                js("(()=>{const e=document.querySelector('.spending-patterns select');e.value='USD';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
                awaitJs("document.querySelector('.spending-patterns').innerText.includes('Purchases')");
                captureHeading("Your spending patterns",theme.toLowerCase()+"-spending-patterns");
                js("Array.from(document.querySelectorAll('.spending-patterns h3')).find(e=>e.textContent==='Monthly balance').scrollIntoView({behavior:'instant'})");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-spending-months");
                js("document.querySelector('.spending-patterns .row button').click()");awaitJs("Boolean(document.querySelector('dialog'))");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-spending-evidence");js("document.querySelector('dialog .icon-button').click()");
                // Use an actual prior file import; intelligence-only SQL fixtures have no staged source document.
                click("Ledger");input("Search transactions","");
                String expense="Array.from(document.querySelectorAll('.transaction-row')).find(e=>e.querySelector('.amount')?.getAttribute('aria-label')?.startsWith('Negative') && !e.textContent.includes('Internal transfer') && !e.textContent.includes('Pending'))";
                awaitJs("Boolean("+expense+")");js(expense+".click()");
                awaitJs("Boolean(document.querySelector('dialog .amount'))");
                String displayed=new JSONArray("["+js("document.querySelector('dialog .amount').textContent")+"]").getString(0);
                java.math.BigDecimal total=new java.math.BigDecimal(displayed.replaceAll("[^0-9.]",""));
                java.math.BigDecimal first=total.divide(new java.math.BigDecimal("2"),2,java.math.RoundingMode.DOWN);
                assertTrue("Synthetic imported expense must support two positive portions",first.signum()>0);
                click("Split this expense");input("Amount 1",first.toPlainString());input("Amount 2",total.subtract(first).toPlainString());
                NativeEvidence.capture(activity,theme.toLowerCase()+"-split-entry");click("Save category split");awaitJs("document.body.innerText.includes('Edit category split')");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-split-saved");click("Remove split");click("Confirm remove split");awaitJs("document.body.innerText.includes('Split this expense')");
                click("Record original amount");input("Original positive amount","10.00");input("Source of original amount","Synthetic receipt for native verification");
                click("Save original amount");awaitJs("document.body.innerText.includes('Implied rate:')");
                captureHeading("Original currency",theme.toLowerCase()+"-original-currency");
                captureHeading("Refunds received",theme.toLowerCase()+"-purchase-refunds");
                click("Remove original amount");click("Confirm remove original amount");awaitJs("document.body.innerText.includes('Record original amount') && !document.body.innerText.includes('Implied rate:')");
                click("Take receipt photo");awaitJs("Boolean(document.querySelector('video[aria-label=\"Live receipt camera preview\"]')) && Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Take photo'&&!e.disabled)");
                NativeEvidence.capture(activity,theme.toLowerCase()+"-receipt-camera-preview");click("Take photo");
                awaitJs("Boolean(document.querySelector('img[alt=\"Receipt photo to review before attaching\"]'))");NativeEvidence.capture(activity,theme.toLowerCase()+"-receipt-camera-review");
                click("Cancel camera");awaitJs("!document.querySelector('[aria-label=\"Receipt camera\"]')");
                js("document.querySelector('dialog .icon-button').click()");

            }
        }
    }
    private void openInsightDetail() throws Exception {js("document.querySelectorAll('main details').forEach(d=>{d.open=true;})");}
    private void selectCurrency() throws Exception {click("Insights");openInsightDetail();awaitJs("Boolean(document.querySelector('.intelligence select'))");js("(()=>{const e=document.querySelector('.intelligence select');e.value='USD';e.dispatchEvent(new Event('change',{bubbles:true}));})()");openInsightDetail();}
    @Test public void a_intelligenceEvidenceAndThemes() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();seed(20,false);selectCurrency();awaitJs("document.body.innerText.includes('Still learning') && document.body.innerText.includes('20 covered days')");for(String theme:new String[]{"Light","Dark"}){click("You");click(theme);selectCurrency();awaitJs("document.body.innerText.includes('20 covered days')");captureHeading("Still learning",theme.toLowerCase()+"-intelligence-learning");}
        }
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();seed(182,false);
            for(String theme:new String[]{"Light","Dark"}) {
                click("You");click(theme);selectCurrency();awaitJs("document.body.innerText.includes('The Drifter') && document.body.innerText.includes('Small purchases add up')");captureHeading("The Drifter",theme.toLowerCase()+"-intelligence-profile");
                js("document.querySelector('.intelligence .surface button').click()");awaitJs("Boolean(document.querySelector('dialog')) && document.body.innerText.includes('Synthetic discretionary')");NativeEvidence.capture(activity,theme.toLowerCase()+"-intelligence-evidence");click("Confirm purchase context");NativeEvidence.capture(activity,theme.toLowerCase()+"-intelligence-context");js("document.querySelector('dialog .icon-button').click()");
                click("Optional reflections");NativeEvidence.capture(activity,theme.toLowerCase()+"-intelligence-reflections");click("Keep these unknown");awaitJs("!document.querySelector('dialog')");
                click("See assumptions and sources");awaitJs("Boolean(document.querySelector('dialog'))");NativeEvidence.capture(activity,theme.toLowerCase()+"-intelligence-forecast");js("document.querySelector('dialog .icon-button').click()");
                click("See what changes if I spend differently");NativeEvidence.capture(activity,theme.toLowerCase()+"-intelligence-scenario");input("A new cost to take on","80");click("Apply scenario");awaitJs("!document.querySelector('dialog')");
                click("Money set aside");input("What are you saving for?","Synthetic rego "+theme);input("Target amount","500");input("Target date",java.time.LocalDate.now().plusDays(90).toString());NativeEvidence.capture(activity,theme.toLowerCase()+"-intelligence-goal");click("Save goal");awaitJs("!document.querySelector('dialog') && document.body.innerText.includes('Synthetic rego "+theme+"')");
            }
        }
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);unlock();seed(182,true);selectCurrency();awaitJs("document.body.innerText.includes('Focus on essentials')");assertEquals("false",js("document.body.innerText.includes('Cashflow outlook')"));
            for(String theme:new String[]{"Light","Dark"}){click("You");click(theme);selectCurrency();awaitJs("document.body.innerText.includes('Focus on essentials')");captureHeading("Focus on essentials",theme.toLowerCase()+"-intelligence-triage");}
        }
    }
}

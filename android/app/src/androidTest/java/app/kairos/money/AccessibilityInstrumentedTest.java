package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class AccessibilityInstrumentedTest {
    private MainActivity activity;
    private String js(String script) throws Exception {CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();activity.runOnUiThread(()->activity.getBridge().getWebView().evaluateJavascript(script,value->{result.set(value);latch.countDown();}));assertTrue("WebView did not respond",latch.await(15,TimeUnit.SECONDS));return result.get();}
    private void awaitJs(String condition) throws Exception {long deadline=System.currentTimeMillis()+45000;while(System.currentTimeMillis()<deadline){if("true".equals(js(condition)))return;Thread.sleep(150);}fail("Accessibility condition failed: "+condition+"; page: "+js("document.body.innerText"));}
    private void click(String text) throws Exception {String button="Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+JSONObject.quote(text)+")";awaitJs("Boolean("+button+")");js(button+".click()");}
    private void inputPin() throws Exception {awaitJs("document.body.innerText.includes('Welcome back')");js("(()=>{const i=document.querySelector('input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'246810');i.dispatchEvent(new Event('input',{bubbles:true}));})()");click("Unlock");awaitJs("Boolean(document.querySelector('nav'))");}
    private void loaded(String tab) throws Exception {
        String content;
        switch (tab) {
            case "Today": content="Boolean(document.querySelector('.intelligence'))"; break;
            case "Ledger": content="document.querySelector('main').innerText.includes('Search transactions')"; break;
            case "Insights":
                js("document.querySelectorAll('main details').forEach(d=>{d.open=true;})");
                content="Boolean(document.querySelector('.spending-patterns select')) && Boolean(document.querySelector('.intelligence select'))"; break;
            case "You": content="Boolean(document.querySelector('.money-visuals select')) && document.querySelector('main').innerText.includes('Combined position')"; break;
            default: content="Boolean(document.querySelector('dialog[open] h2')?.textContent.trim()==='Quick')";
        }
        // Navigation changes synchronously; lazy modules and encrypted queries do not.
        // Require stable loaded content, including before/after the committed capture.
        for (int stable=0; stable<3; stable++) {
            awaitJs(content+" && !document.querySelector('main .skeleton,dialog[open] .skeleton')");
            Thread.sleep(150);
        }
    }
    private void controls() throws Exception {
        assertEquals("Undersized targets", "[]", js("(()=>{const scope=document.querySelector('dialog[open]')||document;return Array.from(scope.querySelectorAll('button,summary,input:not([type=checkbox]),select,textarea')).filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.width<44||r.height<44)}).map(e=>e.textContent.trim()||e.getAttribute('aria-label')||e.tagName)})()"));
        assertEquals("Unnamed controls", "0", js("Array.from(document.querySelectorAll('button,input,select,textarea')).filter(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;if(e.matches('button'))return !e.textContent.trim()&&!e.getAttribute('aria-label');return !e.labels?.length&&!e.getAttribute('aria-label')}).length"));
        assertEquals("Horizontal page overflow", "false", js("document.documentElement.scrollWidth>window.innerWidth"));
        assertEquals("Horizontal dialog overflow", "false", js("(()=>{const d=document.querySelector('dialog[open]');return Boolean(d&&d.scrollWidth>d.clientWidth+1)})()"));
    }
    @Test public void majorScreensRemainNamedAndOperableAtTwoHundredPercentText() throws Exception {
        JSONArray reviewed = new JSONArray();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);inputPin();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().getSettings().setTextZoom(200));
            try {
                for(String theme:new String[]{"Light","Dark"}) {
                    click("You");click(theme);
                    awaitJs("document.documentElement.dataset.theme==="+JSONObject.quote(theme.toLowerCase()));
                    for(String tab:new String[]{"Today","Ledger","Quick","Insights","You"}) {
                        String previousPage=js("document.querySelector('nav [aria-current=page]').textContent.trim()");
                        click(tab);
                        if("Quick".equals(tab)) {
                            awaitJs("Boolean(document.querySelector('dialog[open] h2')?.textContent.trim()==='Quick')");
                            assertEquals("Quick preserves the underlying page",previousPage,js("document.querySelector('nav [aria-current=page]').textContent.trim()"));
                        } else {
                            awaitJs("document.querySelector('nav [aria-current=page]').textContent.trim()==="+JSONObject.quote(tab));
                        }
                        loaded(tab);controls();
                        NativeEvidence.capture(activity,theme.toLowerCase()+"-text-200-"+tab.toLowerCase(),
                            () -> { if(!"Quick".equals(tab)) js("document.querySelector('main h1').scrollIntoView({behavior:'instant',block:'start'})"); },
                            () -> { loaded(tab);controls(); });
                        reviewed.put(new JSONObject().put("theme",theme.toLowerCase()).put("screen",tab).put("text_zoom",200).put("loaded_content",true));
                        if("Quick".equals(tab)) {
                            js("document.querySelector('dialog[open] button[aria-label=\"Close Quick\"]').click()");
                            awaitJs("!document.querySelector('dialog[open]')");
                            assertEquals(previousPage,js("document.querySelector('nav [aria-current=page]').textContent.trim()"));
                        }
                    }
                }
                File directory=new File(activity.getExternalFilesDir(null),"evidence");
                assertTrue(directory.exists()||directory.mkdirs());
                Files.write(new File(directory,"accessibility-loaded-screens.json").toPath(),new JSONObject().put("screens",reviewed).put("scope","Loaded major screens and Quick, names/targets/overflow. Full visual review remains required.").toString(2).getBytes(StandardCharsets.UTF_8));
            }
            finally {InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().getSettings().setTextZoom(100));}
        }
    }
}

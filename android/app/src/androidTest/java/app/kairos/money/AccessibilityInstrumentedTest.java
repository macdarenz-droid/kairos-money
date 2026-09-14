package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
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
    @Test public void majorScreensRemainNamedAndOperableAtTwoHundredPercentText() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(a->activity=a);inputPin();activity.runOnUiThread(()->activity.getBridge().getWebView().getSettings().setTextZoom(200));
            try {
                for(String tab:new String[]{"Today","Ledger","Quick","Insights","You"}) {
                    String previousPage=js("document.querySelector('nav [aria-current=page]').textContent.trim()");
                    click(tab);
                    if("Quick".equals(tab)) {
                        awaitJs("Boolean(document.querySelector('dialog[open] h2')?.textContent.trim()==='Quick')");
                        assertEquals("Quick preserves the underlying page",previousPage,js("document.querySelector('nav [aria-current=page]').textContent.trim()"));
                    } else {
                        awaitJs("document.querySelector('nav [aria-current=page]').textContent.trim()==="+JSONObject.quote(tab));
                    }
                    assertEquals("0",js("Array.from(document.querySelectorAll('button')).filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.width<44||r.height<44)}).length"));
                    assertEquals("0",js("Array.from(document.querySelectorAll('button,input,select,textarea')).filter(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;if(e.matches('button'))return !e.textContent.trim()&&!e.getAttribute('aria-label');return !e.labels?.length&&!e.getAttribute('aria-label')}).length"));
                    assertEquals("false",js("document.documentElement.scrollWidth>window.innerWidth"));
                    NativeEvidence.capture(activity,"text-200-"+tab.toLowerCase());
                    if("Quick".equals(tab)) {
                        js("document.querySelector('dialog[open] button[aria-label=\"Close Quick\"]').click()");
                        awaitJs("!document.querySelector('dialog[open]')");
                        assertEquals(previousPage,js("document.querySelector('nav [aria-current=page]').textContent.trim()"));
                    }
                }
            }
            finally {activity.runOnUiThread(()->activity.getBridge().getWebView().getSettings().setTextZoom(100));}
        }
    }
}

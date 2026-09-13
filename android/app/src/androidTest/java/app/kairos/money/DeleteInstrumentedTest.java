package app.kairos.money;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Run separately: successful Android data deletion intentionally terminates this test process. */
@RunWith(AndroidJUnit4.class)
public class DeleteInstrumentedTest {
    private MainActivity activity;
    private String js(String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1); AtomicReference<String> result=new AtomicReference<>();
        activity.runOnUiThread(()->activity.getBridge().getWebView().evaluateJavascript(script,value->{result.set(value);latch.countDown();}));
        assertTrue(latch.await(15,TimeUnit.SECONDS));return result.get();
    }
    private void waitJs(String condition) throws Exception {
        long end=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<end){if("true".equals(js(condition)))return;Thread.sleep(150);}
        fail("Deletion test UI did not become ready.");
    }
    @Test public void deleteThroughSettings() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->activity=a);
            waitJs("document.body.innerText.includes('Welcome back')");
            js("(()=>{const i=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'246810');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
            js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Unlock').click()");
            waitJs("Boolean(document.querySelector('nav'))");
            js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='You').click()");
            waitJs("document.body.innerText.includes('Delete all data')");
            js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Delete all data').click()");
            waitJs("Boolean(document.querySelector('dialog input[type=checkbox]'))");
            js("document.querySelector('dialog input[type=checkbox]').click()");
            js("Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent.trim()==='Delete all data').click()");
            Thread.sleep(15000);
            fail("Android did not terminate the application after deletion.");
        }
    }
}

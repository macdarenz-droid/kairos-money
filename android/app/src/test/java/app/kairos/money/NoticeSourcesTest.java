package app.kairos.money;

import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class NoticeSourcesTest {
    @Test public void noticesFromAnUntickedAppAreForgotten() {
        assertEquals(Arrays.asList(0, 2), NoticeSources.keep(
            Arrays.asList("com.synthetic.bank", "com.synthetic.store", "com.synthetic.bank"),
            Collections.singletonList("com.synthetic.bank")));
    }

    @Test public void untickingEverythingForgetsEverything() {
        assertEquals(Collections.emptyList(), NoticeSources.keep(
            Arrays.asList("com.synthetic.bank", null), Collections.<String>emptyList()));
    }
}

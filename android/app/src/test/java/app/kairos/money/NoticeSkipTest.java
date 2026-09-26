package app.kairos.money;

import static org.junit.Assert.*;
import org.junit.Test;

public class NoticeSkipTest {
    @Test public void statusNoticesAreSkipped() {
        assertTrue(NoticeSkip.skips(0x02, null, 0, false));          // ongoing
        assertTrue(NoticeSkip.skips(0x40, null, 0, false));          // foreground service
        assertTrue(NoticeSkip.skips(0x200, null, 0, false));         // group summary
        assertTrue(NoticeSkip.skips(0, null, 100, false));
        assertTrue(NoticeSkip.skips(0, null, 0, true));
        assertTrue(NoticeSkip.skips(0, "progress", 0, false));
        assertTrue(NoticeSkip.skips(0, "service", 0, false));
        assertTrue(NoticeSkip.skips(0, "transport", 0, false));
        assertTrue(NoticeSkip.skips(0, "sys", 0, false));
    }

    @Test public void aPlainBankNoticeIsKept() {
        assertFalse(NoticeSkip.skips(0x10, null, 0, false));         // auto-cancel only
        assertFalse(NoticeSkip.skips(0, "msg", 0, false));
        assertFalse(NoticeSkip.skips(0, "status", 0, false));
    }
}

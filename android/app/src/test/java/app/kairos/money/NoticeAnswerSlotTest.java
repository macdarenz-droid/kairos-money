package app.kairos.money;

import static org.junit.Assert.*;
import org.junit.Test;

public class NoticeAnswerSlotTest {
    @Test public void theSlotTheQuestionWasPostedInWins() {
        assertEquals(905, NoticeAnswerSlot.cancel(905, 12));
    }

    @Test public void anOlderQuestionWithoutASlotFallsBackToTheLookup() {
        assertEquals(912, NoticeAnswerSlot.cancel(NoticeAnswerSlot.ABSENT, 12));
    }
}

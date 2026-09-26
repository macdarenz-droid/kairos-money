package app.kairos.money;

import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class NoticeTrimTest {
    @Test public void keepsEverythingWhileThereIsRoom() {
        assertEquals(Arrays.asList(0, 1, 2), NoticeTrim.keep(Arrays.asList(false, true, false), 3));
    }

    @Test public void dropsTheOldestUnansweredBeforeAnyAnswer() {
        List<Boolean> decided = Arrays.asList(true, false, true, false, false);
        assertEquals(Arrays.asList(0, 2, 4), NoticeTrim.keep(decided, 3));
    }

    @Test public void dropsTheOldestAnswerOnlyWhenNothingIsUnanswered() {
        assertEquals(Arrays.asList(1, 2), NoticeTrim.keep(Arrays.asList(true, true, true), 2));
        assertEquals(Arrays.asList(2, 3), NoticeTrim.keep(Arrays.asList(true, false, true, true), 2));
    }
}

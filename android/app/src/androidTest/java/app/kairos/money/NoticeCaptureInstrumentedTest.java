package app.kairos.money;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Arrays;
import java.util.Collections;

/**
 * What the notification reader keeps, and what it refuses to keep.
 *
 * The rules that matter here cannot be checked in jsdom: they are about an Android store that a listener
 * writes to from outside the app, while the ledger is locked and unreachable.
 */
@RunWith(AndroidJUnit4.class)
public class NoticeCaptureInstrumentedTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Before public void clearStore() {
        context.getSharedPreferences(NoticeStore.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test public void readsOnlyTheAppsTheOwnerChose() throws Exception {
        // The grant covers every notification on the phone. This is the line that makes that irrelevant:
        // anything from an app that was not chosen is dropped before it is written anywhere.
        NoticeStore.setSources(context, new JSONArray(Collections.singletonList("app.synthetic.bank")));
        assertNull("A notification from an unchosen app must not be stored",
            NoticeStore.capture(context, "app.synthetic.chat", "Someone", "See you at six", 1000L));
        assertEquals(0, NoticeStore.captured(context).length());

        String id = NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $12.50 at SHOP", 1000L);
        assertNotNull(id);
        JSONArray held = NoticeStore.captured(context);
        assertEquals(1, held.length());
        assertEquals("You spent $12.50 at SHOP", held.getJSONObject(0).getString("text"));
        assertTrue("An unanswered notice carries no decision", held.getJSONObject(0).isNull("decision"));
    }

    @Test public void keepsOneCopyOfARepostedNotification() throws Exception {
        // Banking apps update and repost their own notifications; the same purchase must not pile up.
        NoticeStore.setSources(context, new JSONArray(Collections.singletonList("app.synthetic.bank")));
        String first = NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $12.50 at SHOP", 1000L);
        String again = NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $12.50 at SHOP", 1000L);
        assertNotNull(first);
        assertNull("A repost of the same notification must not be stored twice", again);
        assertEquals(1, NoticeStore.captured(context).length());

        // A genuine second purchase arrives in a different second and is its own question.
        assertNotNull(NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $12.50 at SHOP", 9000L));
        assertEquals(2, NoticeStore.captured(context).length());
    }

    @Test public void recordsAnAnswerGivenInTheShadeWithoutTouchingTheLedger() throws Exception {
        NoticeStore.setSources(context, new JSONArray(Collections.singletonList("app.synthetic.bank")));
        String id = NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $12.50 at SHOP", 1000L);

        // Exactly what the notification's Approve button does, and all it can do: the ledger's key does
        // not exist while Kairos is locked, so the answer waits here until it does.
        NoticeActionReceiver receiver = new NoticeActionReceiver();
        receiver.onReceive(context, new android.content.Intent(NoticeActionReceiver.APPROVE)
            .putExtra(NoticeActionReceiver.EXTRA_ID, id));

        JSONObject stored = NoticeStore.captured(context).getJSONObject(0);
        assertEquals("approved", stored.getString("decision"));
        // Still held, not consumed: the answer is a note to act on at the next unlock, and losing it here
        // would lose the purchase entirely.
        assertEquals(1, NoticeStore.captured(context).length());
        assertEquals(id, stored.getString("id"));
    }

    /** Sixty-five waiting questions: the old slot, a hash modulo 64, had to give two of them the same one. */
    @Test public void givesEveryWaitingNoticeItsOwnSlot() throws Exception {
        NoticeStore.setSources(context, new JSONArray(Collections.singletonList("app.synthetic.bank")));
        java.util.Set<Integer> slots = new java.util.HashSet<>();
        for (int i = 0; i < 65; i++) {
            String id = NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $" + i + ".00 at SHOP", 1000L * (i + 1));
            assertNotNull(id);
            int slot = NoticeStore.slot(context, id);
            assertTrue("slot in range: " + slot, slot >= 0 && slot < 100);
            assertTrue("slot reused: " + slot, slots.add(slot));
        }
    }

    @Test public void forgetsOnlyWhatItWasTold() throws Exception {
        NoticeStore.setSources(context, new JSONArray(Collections.singletonList("app.synthetic.bank")));
        String kept = NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $1.00 at ONE", 1000L);
        String gone = NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $2.00 at TWO", 2000L);
        NoticeStore.forget(context, Arrays.asList(gone));
        assertEquals(Collections.singletonList(kept), NoticeStore.ids(context));
    }

    /**
     * "if i receive something, the notif should also ask not spend / instead, did you received money?"
     *
     * Every captured notice was asked "Did you spend this?", including one that said in its own words
     * money had arrived. The wording now follows what the text actually says, without deciding what the
     * answer means — that is still read once, later, against the account's own currency.
     */
    @Test public void asksAccordingToWhatTheNotificationSaysHappened() {
        assertEquals("Did you receive this?",
            KairosNoticeListener.questionFor("You received P2970.00 from 7 Eleven Cl. New balance is P3146.31").title);
        assertEquals("Did you spend this?",
            KairosNoticeListener.questionFor("You spent $12.50 at SHOP").title);
        assertEquals("Did you receive this?",
            KairosNoticeListener.questionFor("CommBank You've been paid $3.00 into your account ending 407").title);
        // Says both, or neither: asked plainly rather than guessed either way.
        assertEquals("Was this you?", KairosNoticeListener.questionFor("This message mentions money in and money out in the same line.").title);
        assertEquals("Was this you?", KairosNoticeListener.questionFor("Your available balance is $431.20.").title);
    }

    @Test public void storesNoNotificationTextBeforeAnyAppIsChosen() {
        // The state a fresh install is in: access may be granted, nothing is ticked, nothing is captured.
        assertEquals(0, NoticeStore.sources(context).length());
        assertNull(NoticeStore.capture(context, "app.synthetic.bank", "Bank", "You spent $12.50 at SHOP", 1000L));
        assertEquals(0, NoticeStore.captured(context).length());
    }
}

package app.kairos.money;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Takes the answer given in the notification shade.
 *
 * It records the decision and nothing else. It does not open the app, and it does not touch the ledger —
 * it cannot: the ledger is encrypted and its key exists only while Kairos is unlocked, which it almost
 * never is at the moment a purchase notification arrives. The decision waits beside the captured notice
 * and is applied on the next unlock, so approving here means the row is already in the history by the
 * time the owner looks, and rejecting here means it is never written at all.
 *
 * Not exported: only this app's own notification actions can reach it.
 */
public class NoticeActionReceiver extends BroadcastReceiver {
    static final String APPROVE = "app.kairos.money.NOTICE_APPROVE";
    static final String REJECT = "app.kairos.money.NOTICE_REJECT";
    static final String EXTRA_ID = "notice";
    static final String EXTRA_SLOT = "slot";

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String id = intent.getStringExtra(EXTRA_ID);
        if (id == null) return;
        String decision = APPROVE.equals(intent.getAction()) ? "approved"
            : REJECT.equals(intent.getAction()) ? "rejected" : null;
        if (decision == null) return;
        int carried = intent.getIntExtra(EXTRA_SLOT, NoticeAnswerSlot.ABSENT);
        int shade = NoticeAnswerSlot.cancel(carried, carried == NoticeAnswerSlot.ABSENT ? NoticeStore.slot(context, id) : 0);
        NoticeStore.decide(context, id, decision);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(shade);
    }
}

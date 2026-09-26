package app.kairos.money;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.regex.Pattern;

/**
 * Reads the notifications of the banking apps the owner named, and asks about each purchase in the shade.
 *
 * Android has no permission for "only my bank's notifications" — a listener is offered every notification
 * on the phone. That is why nothing is stored until the owner has both granted the access and named the
 * apps: anything from an app that is not on that list is dropped here, in the first few lines, before it
 * is looked at or written anywhere.
 *
 * The question is asked in the shade because answering it should not require opening the app. What the
 * answer cannot do is reach the ledger: its key exists only while Kairos is unlocked, and a purchase
 * notification almost always arrives while it is locked. So an answer given here is recorded beside the
 * captured notice and applied the next time the ledger is open, which is the moment the owner would have
 * seen it anyway.
 */
public class KairosNoticeListener extends NotificationListenerService {
    static final String CHANNEL = "kairos-purchase-check";
    private static final int BASE = 900;

    /**
     * Same two wordlists the ledger reads a captured notice against (src/ingest/notices/parse.ts), kept
     * here only to choose which QUESTION to ask, never to decide what the answer means: that judgement
     * still happens once, in the one place with the account's own currency and rules to check it against.
     *
     * "if i receive something, the notif should also ask not spend / instead, did you received money?"
     * Every notice was asked "Did you spend this?", including one that said in its own words that money
     * had arrived — so the one line the owner reads before answering was already wrong before he pressed
     * anything. Getting the direction backwards here costs nothing that approving does: the wording is
     * corrected on read, never the record, and a phrase this cannot place either way is asked plainly
     * rather than guessed.
     */
    private static final Pattern INWARD = Pattern.compile(
        "\\b(?:been paid|paid into|paid to you|received|deposit(?:ed)?|credited|refund(?:ed)?|transfer(?:red)? from|money in)\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern OUTWARD = Pattern.compile(
        "\\b(?:you spent|spent|purchase(?:d)?|debited|withdrawn|withdrawal|paid from|paid to|payment to|charged|sent to|transfer(?:red)? to|money out)\\b",
        Pattern.CASE_INSENSITIVE);

    static final class Question {
        final String title; final String yes;
        Question(String title, String yes) { this.title = title; this.yes = yes; }
    }
    static Question questionFor(String body) {
        boolean inward = INWARD.matcher(body).find(), outward = OUTWARD.matcher(body).find();
        if (inward && !outward) return new Question("Did you receive this?", "Yes, I did");
        if (outward && !inward) return new Question("Did you spend this?", "Yes, I did");
        return new Question("Was this you?", "Yes, it was");
    }

    @Override public void onNotificationPosted(StatusBarNotification posted) {
        if (posted == null || posted.getPackageName() == null) return;
        if (getPackageName().equals(posted.getPackageName())) return;      // Never read our own questions back.
        if (!NoticeStore.watched(this, posted.getPackageName())) return;

        Notification notification = posted.getNotification();
        if (notification == null) return;
        Bundle extras = notification.extras;
        if (extras == null) return;
        if (NoticeSkip.skips(notification.flags, notification.category,
            extras.getInt(Notification.EXTRA_PROGRESS_MAX, 0),
            extras.getBoolean(Notification.EXTRA_PROGRESS_INDETERMINATE, false))) return;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (text == null) text = extras.getCharSequence(Notification.EXTRA_TEXT);

        String id = NoticeStore.capture(this, posted.getPackageName(),
            title == null ? null : title.toString(), text == null ? null : text.toString(), posted.getPostTime());
        // Still captured so the app can show it, but a login alert gets no Yes that could never be recorded.
        if (id != null && NoticeQuestion.asks(title == null ? null : title.toString(), text == null ? null : text.toString()))
            ask(id, text == null ? "" : text.toString());
    }

    /**
     * Posts the question with its two answers.
     *
     * Hidden while the phone is locked. The whole point of a private ledger is undone if what someone
     * spent is legible to anyone who glances at the screen, so the detail and the buttons appear once the
     * phone is unlocked and the shade is pulled down; the lock screen shows only that Kairos has something
     * to ask.
     */
    private void ask(String id, String detail) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) return;
        if (android.os.Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Check a transaction", NotificationManager.IMPORTANCE_DEFAULT));

        Question question = questionFor(detail);
        int slot = BASE + NoticeStore.slot(this, id);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.kairos_mark)
            .setContentTitle(question.title)
            .setContentText(detail)
            .setStyle(new Notification.BigTextStyle().bigText(detail))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.kairos_mark)
                .setContentTitle("Kairos has a transaction to check")
                .setVisibility(Notification.VISIBILITY_PUBLIC).build())
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(this, slot,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
            .addAction(answer(slot * 2, id, NoticeActionReceiver.APPROVE, question.yes))
            .addAction(answer(slot * 2 + 1, id, NoticeActionReceiver.REJECT, "No"));
        manager.notify(slot, builder.build());
    }

    private Notification.Action answer(int request, String id, String action, String label) {
        Intent intent = new Intent(this, NoticeActionReceiver.class).setAction(action)
            .putExtra(NoticeActionReceiver.EXTRA_ID, id);
        // Immutable: the answer and the notice it belongs to are fixed when the question is asked.
        PendingIntent pending = PendingIntent.getBroadcast(this, request, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(null, label, pending).build();
    }
}

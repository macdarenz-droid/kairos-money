package app.kairos.money;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

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

    @Override public void onNotificationPosted(StatusBarNotification posted) {
        if (posted == null || posted.getPackageName() == null) return;
        if (getPackageName().equals(posted.getPackageName())) return;      // Never read our own questions back.
        if (!NoticeStore.watched(this, posted.getPackageName())) return;

        Notification notification = posted.getNotification();
        if (notification == null) return;
        Bundle extras = notification.extras;
        if (extras == null) return;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (text == null) text = extras.getCharSequence(Notification.EXTRA_TEXT);

        String id = NoticeStore.capture(this, posted.getPackageName(),
            title == null ? null : title.toString(), text == null ? null : text.toString(), posted.getPostTime());
        if (id != null) ask(id, text == null ? "" : text.toString());
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
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Check a purchase", NotificationManager.IMPORTANCE_DEFAULT));

        int slot = BASE + Math.abs(id.hashCode() % 64);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.kairos_mark)
            .setContentTitle("Did you spend this?")
            .setContentText(detail)
            .setStyle(new Notification.BigTextStyle().bigText(detail))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.kairos_mark)
                .setContentTitle("Kairos has a purchase to check")
                .setVisibility(Notification.VISIBILITY_PUBLIC).build())
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(this, slot,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
            .addAction(answer(slot * 2, id, NoticeActionReceiver.APPROVE, "Yes, I did"))
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

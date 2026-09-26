package app.kairos.money;

/** Which posted notifications are status noise, never a transaction. Pure, so it runs in a local JVM test. */
final class NoticeSkip {
    // Values of Notification.FLAG_ONGOING_EVENT, FLAG_FOREGROUND_SERVICE and FLAG_GROUP_SUMMARY, so no SDK is needed.
    static final int ONGOING = 0x02, FOREGROUND_SERVICE = 0x40, GROUP_SUMMARY = 0x200;
    private NoticeSkip() {}

    static boolean skips(int flags, String category, int progressMax, boolean indeterminate) {
        if ((flags & (ONGOING | FOREGROUND_SERVICE | GROUP_SUMMARY)) != 0) return true;
        if (progressMax > 0 || indeterminate) return true;
        return "progress".equals(category) || "service".equals(category)
            || "transport".equals(category) || "sys".equals(category);
    }
}

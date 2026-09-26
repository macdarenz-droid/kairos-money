package app.kairos.money;

/** Which shade question an answer withdraws. Pure, so it runs in a local JVM test. */
final class NoticeAnswerSlot {
    static final int ABSENT = -1;
    private NoticeAnswerSlot() {}

    /** The slot carried by the answer, else the stored one for questions posted before it was carried. */
    static int cancel(int carried, int lookedUp) {
        return carried != ABSENT ? carried : 900 + lookedUp;
    }
}

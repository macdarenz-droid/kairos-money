package app.kairos.money;

import java.util.regex.Pattern;

/** Whether a captured notice is worth a question in the shade. Pure, so it runs in a local JVM test. */
final class NoticeQuestion {
    // Copy of the security pattern in src/ingest/notices/parse.ts: a Yes to a login alert can never be recorded.
    private static final Pattern SECURITY = Pattern.compile(
        "\\b(?:one[- ]?time|verification|security|otp|passcode|log ?in|sign ?in)\\b", Pattern.CASE_INSENSITIVE);
    private NoticeQuestion() {}

    static boolean asks(String title, String text) {
        String body = ((title == null ? "" : title) + " " + (text == null ? "" : text)).replaceAll("\\s+", " ").trim();
        return !SECURITY.matcher(body).find();
    }
}

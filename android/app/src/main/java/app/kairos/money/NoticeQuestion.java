package app.kairos.money;

import java.util.regex.Pattern;

/** Whether a captured notice is worth a question in the shade. Pure, so it runs in a local JVM test. */
final class NoticeQuestion {
    // Copy of the security pattern in src/ingest/notices/parse.ts: a Yes to a login alert can never be recorded.
    private static final Pattern SECURITY = Pattern.compile(
        "\\b(?:one[- ]?time|verification|security|otp|passcode|log ?in|sign ?in)\\b", Pattern.CASE_INSENSITIVE);
    // The codes parse.ts can read (currencyDigits), in any case as parse.ts matches them.
    private static final String CODE = "(?i:AUD|USD|PHP|EUR|GBP|NZD|CAD|SGD|JPY|KWD)";
    // A Yes needs an amount to record: a currency next to digits, or digits with exactly two decimals.
    private static final Pattern MONEY = Pattern.compile(
        "(?:[$\\u20ac\\u00a3\\u00a5\\u20b1]|\\b" + CODE + ")\\s?\\d|\\d\\s?(?:[$\\u20ac\\u00a3\\u00a5\\u20b1]|"
            + CODE + "\\b)|(?<![\\d.])\\d+\\.\\d{2}(?!\\d|\\.\\d)");
    private NoticeQuestion() {}

    static boolean asks(String title, String text) {
        String body = ((title == null ? "" : title) + " " + (text == null ? "" : text)).replaceAll("\\s+", " ").trim();
        return !SECURITY.matcher(body).find() && MONEY.matcher(body).find();
    }
}

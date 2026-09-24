package app.kairos.money;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.List;
import java.util.UUID;

/**
 * THE OUTBOX: what was typed into the quick-add sheet, waiting for the ledger to open.
 *
 * The ledger's key exists only while Kairos is unlocked, so a sheet opened from the home screen cannot
 * write a transaction. It writes here — the same kind of private, short-lived store the bank-notification
 * reader uses — and the app takes each entry into the ledger as a hand-recorded transaction the moment
 * it next opens, then clears it.
 *
 * Also held here: the little the sheet needs to know without the ledger — the account it will land in,
 * by name and currency, and the categories to offer. The app writes that whenever it is unlocked. None
 * of it is a balance or a transaction.
 */
final class QuickAddStore {
    static final String PREFS = "kairos-quick-add";
    static final int LIMIT = 200;
    static final String[] DEFAULT_CATEGORIES = {"Groceries", "Coffee & snacks", "Transport", "Eating out", "Shopping", "Entertainment"};
    private QuickAddStore() {}

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** {accountId, accountName, currency, categories: [name, …]} as the app last wrote it, or an empty object. */
    static JSONObject config(Context context) {
        try { return new JSONObject(prefs(context).getString("config", "{}")); }
        catch (JSONException broken) { return new JSONObject(); }
    }
    static void configure(Context context, JSONObject config) { prefs(context).edit().putString("config", config.toString()).apply(); }

    static String[] categories(Context context) {
        JSONArray listed = config(context).optJSONArray("categories");
        if (listed == null || listed.length() == 0) return DEFAULT_CATEGORIES;
        String[] names = new String[listed.length()];
        for (int i = 0; i < listed.length(); i++) names[i] = listed.optString(i);
        return names;
    }
    static String currency(Context context) { return config(context).optString("currency", "AUD"); }

    static JSONArray pending(Context context) {
        try { return new JSONArray(prefs(context).getString("pending", "[]")); }
        catch (JSONException broken) { return new JSONArray(); }
    }

    /**
     * Keeps one entry. The amount is the decimal string exactly as typed ("4.50"): the ledger turns it
     * into minor units in the account's own currency, the one place that arithmetic is done.
     */
    /** A full outbox is said out loud by the sheet; an entry is never dropped without a word. */
    static boolean full(Context context) { return pending(context).length() >= LIMIT; }

    static String add(Context context, String amount, String direction, String category) {
        if (amount == null || !QuickAddActivity.saveable(amount)) return null;
        if (!"spent".equals(direction) && !"received".equals(direction)) return null;
        JSONArray held = pending(context);
        if (held.length() >= LIMIT) return null;
        String id = UUID.randomUUID().toString();
        try {
            JSONObject entry = new JSONObject();
            entry.put("id", id); entry.put("amount", amount); entry.put("direction", direction);
            entry.put("category", category == null ? JSONObject.NULL : category);
            entry.put("currency", currency(context));
            entry.put("accountId", config(context).optString("accountId", ""));
            entry.put("at", System.currentTimeMillis());
            held.put(entry);
        } catch (JSONException impossible) { return null; }
        prefs(context).edit().putString("pending", held.toString()).apply();
        return id;
    }

    static void clear(Context context, List<String> ids) {
        JSONArray held = pending(context), kept = new JSONArray();
        for (int i = 0; i < held.length(); i++) {
            JSONObject entry = held.optJSONObject(i);
            if (entry != null && !ids.contains(entry.optString("id"))) kept.put(entry);
        }
        prefs(context).edit().putString("pending", kept.toString()).apply();
    }
}

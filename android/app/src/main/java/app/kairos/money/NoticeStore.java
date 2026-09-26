package app.kairos.money;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/**
 * The bank notifications this phone captured, and what the owner decided about each.
 *
 * Held in the app's own private storage rather than in the encrypted ledger, deliberately and at the
 * owner's instruction. The ledger's key exists only while Kairos is unlocked, so a notification arriving
 * on a locked phone could not be written there at all; it would have to be dropped. What sits here is a
 * short-lived question — "did you spend this?" — erased as soon as it is answered and applied.
 *
 * Nothing here is money. A row becomes a transaction only after the owner approves it and the ledger is
 * open to receive it.
 */
final class NoticeStore {
    static final String PREFS = "kairos-notices";
    private static final int LIMIT = 100;
    private NoticeStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray sources(Context context) {
        try { return new JSONArray(prefs(context).getString("sources", "[]")); }
        catch (JSONException broken) { return new JSONArray(); }
    }

    /** Returns the shade slots of the notices it forgot, so their questions can be withdrawn. */
    static synchronized List<Integer> setSources(Context context, JSONArray packages) {
        // Unticking forgets the app's unanswered notices in the same step; a Yes not yet recorded stays so it is not lost.
        List<String> watched = new ArrayList<>();
        for (int i = 0; i < packages.length(); i++) watched.add(packages.optString(i));
        JSONArray held = captured(context), next = new JSONArray();
        List<String> from = new ArrayList<>(), decisions = new ArrayList<>();
        for (int i = 0; i < held.length(); i++) {
            JSONObject e = held.optJSONObject(i);
            from.add(e == null ? null : e.optString("source", null));
            decisions.add(e == null || e.isNull("decision") ? null : e.optString("decision"));
        }
        List<Integer> kept = NoticeSources.keep(from, decisions, watched), dropped = new ArrayList<>();
        for (int i = 0; i < held.length(); i++) {
            JSONObject e = held.optJSONObject(i);
            if (kept.contains(i)) next.put(e);
            else if (e != null) dropped.add(e.has("slot") ? e.optInt("slot") : Math.abs(e.optString("id").hashCode() % 64));
        }
        prefs(context).edit().putString("sources", packages.toString()).putString("captured", next.toString()).apply();
        return dropped;
    }

    static boolean watched(Context context, String source) {
        JSONArray allowed = sources(context);
        for (int i = 0; i < allowed.length(); i++) if (source.equals(allowed.optString(i))) return true;
        return false;
    }

    static JSONArray captured(Context context) {
        try { return new JSONArray(prefs(context).getString("captured", "[]")); }
        catch (JSONException broken) { return new JSONArray(); }
    }

    /**
     * Stores one notification from a watched app, if it is not already held.
     *
     * A banking app repeats and updates its own notifications, so the same purchase can arrive several
     * times. The identity here is the text together with the second it was posted: a genuine second
     * purchase of the same amount at the same shop lands in a different second, while a repost of one
     * purchase does not.
     */
    static synchronized String capture(Context context, String source, String title, String text, long postedAt) {
        if (!watched(context, source)) return null;
        String body = (title == null ? "" : title) + " | " + (text == null ? "" : text);
        if (body.replace("|", "").trim().isEmpty()) return null;
        String id = "notice:" + (postedAt / 1000L) + ":" + Integer.toHexString(body.hashCode()).replace("-", "n");
        JSONArray held = captured(context);
        for (int i = 0; i < held.length(); i++) {
            JSONObject entry = held.optJSONObject(i);
            if (entry != null && id.equals(entry.optString("id"))) return null;
        }
        try {
            JSONObject entry = new JSONObject().put("id", id).put("source", source)
                .put("title", title == null ? "" : title).put("text", text == null ? "" : text)
                .put("postedAt", postedAt).put("decision", JSONObject.NULL);
            JSONArray next = new JSONArray();
            // An answer waits to be applied, so the stalest unanswered entry is shed before any answer.
            List<Boolean> decided = new ArrayList<>();
            for (int i = 0; i < held.length(); i++) { JSONObject e = held.optJSONObject(i); decided.add(e != null && !e.isNull("decision") && !e.optString("decision").isEmpty()); }
            for (int i : NoticeTrim.keep(decided, LIMIT - 1)) next.put(held.get(i));
            // Its own notification slot, so two questions never replace each other or share buttons.
            boolean[] used = new boolean[LIMIT];
            for (int i = 0; i < next.length(); i++) { int taken = next.getJSONObject(i).optInt("slot", -1); if (taken >= 0 && taken < LIMIT) used[taken] = true; }
            int slot = 0;
            while (slot < LIMIT - 1 && used[slot]) slot++;
            entry.put("slot", slot);
            next.put(entry);
            prefs(context).edit().putString("captured", next.toString()).apply();
            return id;
        } catch (JSONException broken) { return null; }
    }

    /** Records an answer given in the notification shade, to be applied when the ledger is next open. */
    static synchronized boolean decide(Context context, String id, String decision) {
        JSONArray held = captured(context);
        boolean found = false;
        for (int i = 0; i < held.length(); i++) {
            JSONObject entry = held.optJSONObject(i);
            if (entry == null || !id.equals(entry.optString("id"))) continue;
            try { entry.put("decision", decision); found = true; } catch (JSONException ignored) {}
        }
        if (found) prefs(context).edit().putString("captured", held.toString()).apply();
        return found;
    }

    static synchronized void forget(Context context, List<String> ids) {
        JSONArray held = captured(context), next = new JSONArray();
        for (int i = 0; i < held.length(); i++) {
            JSONObject entry = held.optJSONObject(i);
            if (entry != null && !ids.contains(entry.optString("id"))) next.put(entry);
        }
        prefs(context).edit().putString("captured", next.toString()).apply();
    }

    /** The notification slot a notice was given; notices held from before slots existed keep their old one. */
    static int slot(Context context, String id) {
        JSONArray held = captured(context);
        for (int i = 0; i < held.length(); i++) {
            JSONObject entry = held.optJSONObject(i);
            if (entry != null && id.equals(entry.optString("id")) && entry.has("slot")) return entry.optInt("slot");
        }
        return Math.abs(id.hashCode() % 64);
    }

    static List<String> ids(Context context) {
        JSONArray held = captured(context);
        List<String> all = new ArrayList<>();
        for (int i = 0; i < held.length(); i++) {
            JSONObject entry = held.optJSONObject(i);
            if (entry != null) all.add(entry.optString("id"));
        }
        return all;
    }
}

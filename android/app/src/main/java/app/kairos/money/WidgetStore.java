package app.kairos.money;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;

/**
 * What the widgets show outside the encrypted ledger: a style, the amounts switch, and, while it is on,
 * two formatted figures and seven bar heights from the last unlock. Nothing else.
 */
final class WidgetStore {
    static final String PREFS = "kairos-widgets";
    static final String[] STYLES = {"glass", "paper", "indigo"};
    private WidgetStore() {}
    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String style(Context context) {
        String style = prefs(context).getString("style", "glass");
        for (String known : STYLES) if (known.equals(style)) return style;
        return "glass";
    }
    static boolean showAmounts(Context context) { return prefs(context).getBoolean("showAmounts", true); }

    static void settings(Context context, String style, boolean showAmounts) {
        boolean known = false;
        for (String each : STYLES) known |= each.equals(style);
        if (!known) throw new IllegalArgumentException("Unknown widget style.");
        SharedPreferences.Editor edit = prefs(context).edit().putString("style", style).putBoolean("showAmounts", showAmounts);
        // Turning amounts off removes them from the phone, not just from view.
        if (!showAmounts) edit.remove("left").remove("spent").remove("bars");
        edit.apply();
    }

    static void figures(Context context, String left, String spent, int[] bars) {
        if (!showAmounts(context)) return;
        JSONArray heights = new JSONArray();
        for (int i = 0; i < 7; i++) heights.put(bars != null && i < bars.length ? Math.max(0, Math.min(100, bars[i])) : 0);
        SharedPreferences.Editor edit = prefs(context).edit().putString("bars", heights.toString());
        if (left == null) edit.remove("left"); else edit.putString("left", left);
        if (spent == null) edit.remove("spent"); else edit.putString("spent", spent);
        edit.apply();
    }

    /** Null when hidden or not yet written. */
    static String left(Context context) { return showAmounts(context) ? prefs(context).getString("left", null) : null; }
    static String spent(Context context) { return showAmounts(context) ? prefs(context).getString("spent", null) : null; }
    static boolean hasFigures(Context context) { return showAmounts(context) && prefs(context).contains("bars"); }
    static int[] bars(Context context) {
        int[] heights = new int[7];
        if (!showAmounts(context)) return heights;
        try {
            JSONArray saved = new JSONArray(prefs(context).getString("bars", "[]"));
            for (int i = 0; i < 7 && i < saved.length(); i++) heights[i] = Math.max(0, Math.min(100, saved.optInt(i)));
        } catch (org.json.JSONException broken) { return new int[7]; }
        return heights;
    }
}

package app.kairos.money;

import android.content.Context;
import android.content.res.Configuration;

// Hand-written id lists (only colours are generated); tests/theme-native-source.test.ts keeps them
// equal to the registry. "system" resolves only to dark or light.
final class Appearance {
    static final String PREFS = "kairos-appearance";
    private Appearance() {}

    static boolean known(String id) {
        switch (id) {
            case "dark": case "light": case "black": case "paper": case "contrast": return true;
            default: return false;
        }
    }
    static String preference(Context context) {
        String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("theme", "system");
        return saved != null && (saved.equals("system") || known(saved)) ? saved : "system";
    }
    static String resolved(Context context) {
        String preference = preference(context);
        if (!preference.equals("system")) return preference;
        return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_NO ? "light" : "dark";
    }
    /** True for the themes whose scheme is light. */
    static boolean light(String id) {
        switch (id) {
            case "light": case "paper": case "contrast": return true;
            default: return false;
        }
    }
    static int background(String id) {
        switch (id) {
            case "light": return R.color.kairos_bg_light;
            case "black": return R.color.kairos_bg_black;
            case "paper": return R.color.kairos_bg_paper;
            case "contrast": return R.color.kairos_bg_contrast;
            default: return R.color.kairos_bg_dark;
        }
    }
}

package app.kairos.money;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** The web layer's side of the home-screen quick add: what the sheet should offer, what it captured, and forgetting. */
@CapacitorPlugin(name = "KairosQuickAdd")
public class KairosQuickAddPlugin extends Plugin {
    /** The account the sheet will land in and the categories it offers. Written whenever the app is unlocked. */
    @PluginMethod public void configure(PluginCall call) {
        try {
            JSONObject config = new JSONObject();
            config.put("accountId", call.getString("accountId", ""));
            config.put("accountName", call.getString("accountName", ""));
            config.put("currency", call.getString("currency", "AUD"));
            JSArray categories = call.getArray("categories");
            config.put("categories", categories == null ? new JSONArray() : new JSONArray(categories.toString()));
            QuickAddStore.configure(getContext(), config);
            QuickAddWidget.refresh(getContext());
            call.resolve();
        } catch (JSONException broken) { call.reject("The quick-add settings could not be written."); }
    }
    @PluginMethod public void widgetSettings(PluginCall call) {
        JSObject result = new JSObject();
        result.put("style", WidgetStore.style(getContext())); result.put("showAmounts", WidgetStore.showAmounts(getContext()));
        call.resolve(result);
    }
    @PluginMethod public void setWidgetSettings(PluginCall call) {
        try { WidgetStore.settings(getContext(), call.getString("style", "glass"), !Boolean.FALSE.equals(call.getBoolean("showAmounts", true))); }
        catch (IllegalArgumentException unknown) { call.reject(unknown.getMessage()); return; }
        Widgets.refreshAll(getContext());
        call.resolve();
    }
    /** Formatted figures and whole-percent bar heights from this unlock; ignored while amounts are off. */
    @PluginMethod public void widgetFigures(PluginCall call) {
        JSArray listed = call.getArray("bars");
        int[] bars = new int[7];
        if (listed != null) for (int i = 0; i < 7 && i < listed.length(); i++) bars[i] = listed.optInt(i);
        WidgetStore.figures(getContext(), call.getString("left"), call.getString("spent"), bars);
        Widgets.refreshAll(getContext());
        call.resolve();
    }
    @PluginMethod public void pending(PluginCall call) {
        JSObject result = new JSObject();
        result.put("entries", QuickAddStore.pending(getContext()));
        call.resolve(result);
    }
    @PluginMethod public void clear(PluginCall call) {
        List<String> ids = new ArrayList<>();
        JSArray listed = call.getArray("ids");
        if (listed != null) for (int i = 0; i < listed.length(); i++) ids.add(listed.optString(i));
        QuickAddStore.clear(getContext(), ids);
        call.resolve();
    }
}

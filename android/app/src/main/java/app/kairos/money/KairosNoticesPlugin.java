package app.kairos.money;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** The web layer's side of reading bank notifications. Grants, choices, what was captured, and forgetting. */
@CapacitorPlugin(name = "KairosNotices")
public class KairosNoticesPlugin extends Plugin {

    /** Whether the owner has granted notification access, and which apps they chose to watch. */
    @PluginMethod public void access(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", granted());
        result.put("sources", NoticeStore.sources(getContext()));
        call.resolve(result);
    }

    private boolean granted() {
        String enabled = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        ComponentName us = new ComponentName(getContext(), KairosNoticeListener.class);
        for (String entry : enabled.split(":")) {
            ComponentName component = ComponentName.unflattenFromString(entry);
            if (component != null && component.equals(us)) return true;
        }
        return false;
    }

    /**
     * Opens the system screen where notification access is granted.
     *
     * Only Android can grant it — there is no in-app path, by design, because the access covers every
     * notification on the phone and the system wants the owner to see that stated in its own words.
     */
    @PluginMethod public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** The launchable apps on this phone, for the owner to pick their bank from. */
    @PluginMethod public void installed(PluginCall call) {
        PackageManager packages = getContext().getPackageManager();
        List<JSONObject> apps = new ArrayList<>();
        for (ApplicationInfo info : packages.getInstalledApplications(0)) {
            if (info.packageName == null || info.packageName.equals(getContext().getPackageName())) continue;
            if (packages.getLaunchIntentForPackage(info.packageName) == null) continue;
            CharSequence label = packages.getApplicationLabel(info);
            try { apps.add(new JSONObject().put("id", info.packageName).put("label", label == null ? info.packageName : label.toString())); }
            catch (org.json.JSONException ignored) {}
        }
        apps.sort((a, b) -> a.optString("label").compareToIgnoreCase(b.optString("label")));
        JSObject result = new JSObject();
        result.put("apps", new JSONArray(apps));
        call.resolve(result);
    }

    /** Sets which apps are read. Everything from any other app is dropped before it is stored. */
    @PluginMethod public void listen(PluginCall call) {
        JSArray sources = call.getArray("sources");
        if (sources == null) { call.reject("Choose which apps to read."); return; }
        if (sources.length() > 16) { call.reject("Choose at most sixteen apps to read."); return; }
        android.app.NotificationManager manager = getContext().getSystemService(android.app.NotificationManager.class);
        for (int slot : NoticeStore.setSources(getContext(), sources)) if (manager != null) manager.cancel(900 + slot);
        call.resolve();
    }

    @PluginMethod public void captured(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notices", NoticeStore.captured(getContext()));
        call.resolve(result);
    }

    @PluginMethod public void forget(PluginCall call) {
        JSArray ids = call.getArray("ids");
        if (ids == null) { call.reject("Name the notifications to forget."); return; }
        List<String> list = new ArrayList<>();
        for (int i = 0; i < ids.length(); i++) list.add(ids.optString(i));
        NoticeStore.forget(getContext(), list);
        call.resolve();
    }
}

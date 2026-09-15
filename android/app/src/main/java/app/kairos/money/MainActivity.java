package app.kairos.money;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.content.Intent;
import android.view.View;
import android.view.ViewTreeObserver;
import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowInsetsControllerCompat;
import java.util.UUID;

public class MainActivity extends BridgeActivity {
    private static final String QUICK_ADD_STATE = "kairos.pendingQuickAdd";
    private String pendingQuickAdd;

    @Override protected void load() {
        View webView = findViewById(com.getcapacitor.android.R.id.webview);
        webView.setVisibility(View.INVISIBLE);
        super.load();
        View decor = getWindow().getDecorView();
        decor.getViewTreeObserver().addOnDrawListener(new ViewTreeObserver.OnDrawListener() {
            private boolean scheduled;
            @Override public void onDraw() {
                if (scheduled) return;
                scheduled = true;
                decor.post(() -> {
                    if (decor.getViewTreeObserver().isAlive()) decor.getViewTreeObserver().removeOnDrawListener(this);
                    if (isFinishing() || isDestroyed() || getBridge() == null) return;
                    webView.setVisibility(View.VISIBLE);
                    QuickAddWidget.refresh(getApplicationContext());
                });
            }
        });
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        pendingQuickAdd = savedInstanceState == null
            ? (QuickAddWidget.QUICK_ADD.equals(getIntent().getAction()) ? UUID.randomUUID().toString() : null)
            : savedInstanceState.getString(QUICK_ADD_STATE);
        String preference = getSharedPreferences("kairos-appearance", MODE_PRIVATE).getString("theme", "system");
        boolean light = preference.equals("light") || (preference.equals("system") && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_NO);
        setTheme(light ? R.style.AppTheme_Light : R.style.AppTheme_Dark);
        // Screenshots and screen recording are deliberately NOT blocked, at the owner's request.
        //
        // FLAG_SECURE used to be set here, which stopped him photographing his own screen to show someone
        // what was wrong with it. A privacy control that prevents the user describing their own problem
        // costs more than it protects: what it defends against needs physical access to an already
        // unlocked phone, and anyone in that position can photograph the screen with a second device.
        //
        // What this gives up: app content is now visible in the recent-apps switcher and to screen
        // recorders. What is unchanged: the app lock, the encrypted database, and the key protection. This
        // affects what someone watching the running screen can capture, not what is stored.
        registerPlugin(KairosVaultPlugin.class);
        registerPlugin(KairosTextPlugin.class);
        registerPlugin(KairosReminderPlugin.class);
        registerPlugin(KairosLaunchPlugin.class);
        registerPlugin(KairosNoticesPlugin.class);
        super.onCreate(savedInstanceState);
        applyAppearance(false);
    }
    void applyAppearance(boolean refreshWidget) {
        String preference = getSharedPreferences("kairos-appearance", MODE_PRIVATE).getString("theme", "system");
        boolean light = preference.equals("light") || (preference.equals("system") && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_NO);
        int background = Color.parseColor(light ? "#FCFCFD" : "#08090A");
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        getWindow().setStatusBarColor(background); getWindow().setNavigationBarColor(background);
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(light); bars.setAppearanceLightNavigationBars(light);
        if (getBridge() != null) getBridge().getWebView().setBackgroundColor(background);
        if (refreshWidget) QuickAddWidget.refresh(this);
    }
    @Override protected void onNewIntent(Intent intent) {
        // BridgeActivity also forwards the original cold-start intent during load.
        // Keep that intent unchanged: pending navigation is separate activity state.
        if (intent != getIntent() && QuickAddWidget.QUICK_ADD.equals(intent.getAction())) {
            pendingQuickAdd = UUID.randomUUID().toString();
        }
        super.onNewIntent(intent);
        if (pendingQuickAdd != null && getBridge() != null) getBridge().triggerWindowJSEvent("kairosQuickAdd");
    }
    @Override public void onSaveInstanceState(Bundle outState) {
        outState.putString(QUICK_ADD_STATE, pendingQuickAdd);
        super.onSaveInstanceState(outState);
    }
    String pendingQuickAddRequest() { return pendingQuickAdd; }
    boolean acknowledgeQuickAdd(String requestId) {
        if (requestId == null || !requestId.equals(pendingQuickAdd)) return false;
        pendingQuickAdd = null;
        return true;
    }
    @Override public void onConfigurationChanged(Configuration configuration) { super.onConfigurationChanged(configuration); applyAppearance(true); }
}

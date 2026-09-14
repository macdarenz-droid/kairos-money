package app.kairos.money;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.content.Intent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
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
        String preference = getSharedPreferences("kairos-appearance", MODE_PRIVATE).getString("theme", "system");
        boolean light = preference.equals("light") || (preference.equals("system") && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_NO);
        setTheme(light ? R.style.AppTheme_Light : R.style.AppTheme_Dark);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(KairosVaultPlugin.class);
        registerPlugin(KairosTextPlugin.class);
        registerPlugin(KairosReminderPlugin.class);
        registerPlugin(KairosLaunchPlugin.class);
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
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent);setIntent(intent);if(getBridge()!=null)getBridge().triggerWindowJSEvent("kairosQuickAdd"); }
    @Override public void onConfigurationChanged(Configuration configuration) { super.onConfigurationChanged(configuration); applyAppearance(true); }
}

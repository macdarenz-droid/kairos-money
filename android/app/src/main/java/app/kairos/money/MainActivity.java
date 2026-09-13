package app.kairos.money;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        String preference = getSharedPreferences("kairos-appearance", MODE_PRIVATE).getString("theme", "system");
        boolean light = preference.equals("light") || (preference.equals("system") && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_NO);
        setTheme(light ? R.style.AppTheme_Light : R.style.AppTheme_Dark);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(KairosVaultPlugin.class);
        super.onCreate(savedInstanceState);
        applyAppearance();
    }
    void applyAppearance() {
        String preference = getSharedPreferences("kairos-appearance", MODE_PRIVATE).getString("theme", "system");
        boolean light = preference.equals("light") || (preference.equals("system") && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_NO);
        int background = Color.parseColor(light ? "#FCFCFD" : "#08090A");
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        getWindow().setStatusBarColor(background); getWindow().setNavigationBarColor(background);
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(light); bars.setAppearanceLightNavigationBars(light);
        if (getBridge() != null) getBridge().getWebView().setBackgroundColor(background);
    }
    @Override public void onConfigurationChanged(Configuration configuration) { super.onConfigurationChanged(configuration); applyAppearance(); }
}

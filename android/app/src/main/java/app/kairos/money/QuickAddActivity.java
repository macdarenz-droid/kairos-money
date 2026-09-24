package app.kairos.money;

import android.animation.ValueAnimator;
import android.content.res.ColorStateList;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import java.util.Currency;

/**
 * THE QUICK-ADD SHEET. Opened by the widget over the home screen; the app itself never comes forward.
 *
 * Amount, spent or received, a category, Save. The sheet has its own keypad rather than the system
 * keyboard so it is the same height every time and works with one thumb. Saving writes the outbox and
 * tells the widget, then the sheet sinks away.
 *
 * Nothing here reads or writes the ledger: it cannot, the ledger is locked. That is the whole reason
 * the outbox exists.
 */
public class QuickAddActivity extends AppCompatActivity {
    private String amount = "";
    private String direction = "spent";
    private String category = null;
    private TextView amountView, spentView, receivedView;
    private LinearLayout chips;
    private View sheet;

    /**
     * One key press against the amount typed so far. Pure, so the device test can pin the rules: one
     * decimal point, at most two decimals, at most nine whole digits, no leading zeros, and delete
     * removes one character.
     */
    static String press(String current, String key) {
        if ("back".equals(key)) return current.isEmpty() ? "" : current.substring(0, current.length() - 1);
        if (".".equals(key)) return current.contains(".") ? current : current.isEmpty() ? "0." : current + ".";
        if (!key.matches("\\d")) return current;
        int dot = current.indexOf('.');
        if (dot >= 0) return current.length() - dot > 2 ? current : current + key;
        if (current.equals("0")) return key;
        return current.length() >= 9 ? current : current + key;
    }
    /** A real amount above zero. Decided on the digits themselves: no number type touches money here. */
    static boolean saveable(String current) {
        return current.matches("\\d{1,9}(\\.\\d{1,2})?") && !current.replace(".", "").replace("0", "").isEmpty();
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        // The sheet follows the app's own light or dark choice, not only the system's.
        String preference = getSharedPreferences("kairos-appearance", MODE_PRIVATE).getString("theme", "system");
        getDelegate().setLocalNightMode(preference.equals("light") ? AppCompatDelegate.MODE_NIGHT_NO : preference.equals("dark") ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
        setContentView(R.layout.quick_add_sheet);
        sheet = findViewById(R.id.qa_sheet);
        amountView = findViewById(R.id.qa_amount); spentView = findViewById(R.id.qa_spent); receivedView = findViewById(R.id.qa_received);
        chips = findViewById(R.id.qa_chips);
        if (state != null) { amount = state.getString("amount", ""); direction = state.getString("direction", "spent"); category = state.getString("category"); }
        else category = getIntent().getStringExtra(QuickAddWidget.EXTRA_CATEGORY);

        String code = QuickAddStore.currency(this), accountName = QuickAddStore.config(this).optString("accountName", "");
        ((TextView) findViewById(R.id.qa_symbol)).setText(symbol(code));
        ((TextView) findViewById(R.id.qa_account)).setText((accountName.isEmpty() ? getString(R.string.qa_no_account) : accountName) + " · " + code);

        findViewById(R.id.qa_scrim).setOnClickListener(v -> close());
        findViewById(R.id.qa_close).setOnClickListener(v -> close());
        spentView.setOnClickListener(v -> { direction = "spent"; showDirection(); });
        receivedView.setOnClickListener(v -> { direction = "received"; showDirection(); });
        ViewGroup keys = findViewById(R.id.qa_keys);
        for (int i = 0; i < keys.getChildCount(); i++) {
            View key = keys.getChildAt(i);
            key.setOnClickListener(v -> tap(String.valueOf(v.getTag())));
            key.setOnTouchListener(QuickAddActivity::squeeze);
        }
        Button save = findViewById(R.id.qa_save);
        save.setOnClickListener(v -> save());
        save.setOnTouchListener(QuickAddActivity::squeeze);
        for (String name : QuickAddStore.categories(this)) chips.addView(chip(name));

        showAmount(false); showDirection(); showCategory();
        // The sheet rises from below the screen as the scrim fades in behind it.
        sheet.post(() -> { sheet.setTranslationY(sheet.getHeight()); sheet.animate().translationY(0).setDuration(280).setInterpolator(new DecelerateInterpolator(2f)).start(); });
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putString("amount", amount); out.putString("direction", direction); out.putString("category", category);
    }

    private TextView chip(String name) {
        TextView view = new TextView(this, null, 0, R.style.Widget_Kairos_Chip);
        view.setText(name); view.setTag(name);
        view.setCompoundDrawablesRelativeWithIntrinsicBounds(QuickAddWidget.icon(name), 0, 0, 0);
        view.setCompoundDrawablePadding(dp(6));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(34));
        params.setMarginEnd(dp(8));
        view.setLayoutParams(params);
        view.setPaddingRelative(dp(12), 0, dp(12), 0);
        view.setOnClickListener(v -> { category = name.equals(category) ? null : name; showCategory(); });
        view.setOnTouchListener(QuickAddActivity::squeeze);
        return view;
    }

    /** A key shrinks a touch under the finger and springs back: the one place the sheet moves while typing. */
    private static boolean squeeze(View view, MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) view.animate().scaleX(0.94f).scaleY(0.94f).setDuration(70).start();
        else if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) view.animate().scaleX(1f).scaleY(1f).setDuration(120).start();
        return false;
    }

    private void tap(String key) {
        String next = press(amount, key);
        if (next.equals(amount)) return;
        amount = next;
        amountView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
        showAmount(true);
    }

    private void showAmount(boolean bump) {
        amountView.setText(amount.isEmpty() ? "0" : amount);
        findViewById(R.id.qa_save).setEnabled(saveable(amount));
        findViewById(R.id.qa_save).setAlpha(saveable(amount) ? 1f : 0.5f);
        if (!bump) return;
        // The figure ticks: a small scale from the baseline, the way a counter lands.
        ValueAnimator tick = ValueAnimator.ofFloat(1.04f, 1f);
        tick.setDuration(140); tick.setInterpolator(new DecelerateInterpolator());
        tick.addUpdateListener(a -> { float s = (float) a.getAnimatedValue(); amountView.setScaleX(s); amountView.setScaleY(s); });
        tick.start();
    }

    private void showDirection() {
        boolean spent = "spent".equals(direction);
        style(spentView, spent); style(receivedView, !spent);
    }
    private void showCategory() {
        for (int i = 0; i < chips.getChildCount(); i++) { TextView chip = (TextView) chips.getChildAt(i); style(chip, chip.getTag().equals(category)); }
    }
    private void style(TextView view, boolean selected) {
        view.setBackgroundResource(selected ? R.drawable.qa_chip_selected : R.drawable.qa_chip_ripple);
        int color = getColor(selected ? R.color.qa_accent : (view == spentView || view == receivedView ? R.color.qa_text2 : R.color.qa_text));
        view.setTextColor(color);
        view.setCompoundDrawableTintList(ColorStateList.valueOf(color));
    }

    private void save() {
        if (!saveable(amount)) return;
        if (QuickAddStore.full(this)) { Toast.makeText(this, R.string.qa_full, Toast.LENGTH_LONG).show(); return; }
        String id = QuickAddStore.add(this, amount, direction, category);
        if (id == null) { close(); return; }
        String code = QuickAddStore.currency(this);
        QuickAddWidget.showSaved(this, getString(R.string.widget_saved, symbol(code) + amount, category == null ? getString(R.string.qa_title) : QuickAddWidget.shortLabel(category)));
        sheet.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK);
        close();
    }

    /** The sheet sinks below the screen, then the window fades. */
    private void close() {
        sheet.animate().translationY(sheet.getHeight()).setDuration(220).withEndAction(() -> { finish(); overridePendingTransition(0, R.anim.qa_fade_out); }).start();
    }

    static String symbol(String code) {
        try { String s = Currency.getInstance(code).getSymbol(); return s.length() > 3 ? code + " " : s; } catch (IllegalArgumentException unknown) { return code + " "; }
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}

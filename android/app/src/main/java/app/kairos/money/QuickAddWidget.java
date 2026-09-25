package app.kairos.money;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.widget.RemoteViews;

/**
 * W2, the slim 4×1 row: three category chips and add, each opening the quick-add sheet over the home
 * screen. It keeps its class and ids, so widgets placed before the redesign carry on working.
 * After a save the chips flip to "Saved $4.50 · Coffee" for a few seconds, unless animations are off.
 */
public class QuickAddWidget extends AppWidgetProvider {
    /** Kept for MainActivity, which still answers this action from older widgets that were placed before the sheet existed. */
    static final String QUICK_ADD = "app.kairos.money.QUICK_ADD";
    static final String ACTION_RESTORE_LABEL = "app.kairos.money.widget.RESTORE_LABEL";
    static final String EXTRA_CATEGORY = "category";
    static final long SAVED_LABEL_MS = 6000L;
    private static final int[] CHIPS = {R.id.widget_chip_1, R.id.widget_chip_2, R.id.widget_chip_3};

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (ACTION_RESTORE_LABEL.equals(intent.getAction())) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.quick_add_widget);
            views.setDisplayedChild(R.id.widget_flip, 0);
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            manager.partiallyUpdateAppWidget(manager.getAppWidgetIds(new ComponentName(context, QuickAddWidget.class)), views);
            return;
        }
        super.onReceive(context, intent);
    }

    static RemoteViews build(Context context) {
        Widgets.Look look = Widgets.look(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.quick_add_widget);
        views.setInt(R.id.widget_root, "setBackgroundResource", look.background);
        Widgets.addButton(context, views, R.id.widget_add, look);
        views.setTextColor(R.id.widget_saved, look.text);
        String[] categories = QuickAddStore.categories(context);
        for (int i = 0; i < CHIPS.length; i++) {
            String category = i < categories.length ? categories[i] : null;
            views.setViewVisibility(CHIPS[i], category == null ? android.view.View.INVISIBLE : android.view.View.VISIBLE);
            if (category == null) continue;
            views.setTextViewText(CHIPS[i], shortLabel(category));
            views.setTextColor(CHIPS[i], look.text);
            views.setInt(CHIPS[i], "setBackgroundResource", look.tap);
            views.setTextViewCompoundDrawablesRelative(CHIPS[i], icon(category), 0, 0, 0);
            views.setOnClickPendingIntent(CHIPS[i], Widgets.open(context, category, 430 + i));
        }
        return views;
    }

    /** A chip has room for one word; "Coffee & snacks" is "Coffee" on it and the full name in the sheet. */
    static String shortLabel(String category) {
        int cut = category.indexOf(" & ");
        return cut > 0 ? category.substring(0, cut) : category;
    }

    static int icon(String category) {
        String name = category.toLowerCase();
        if (name.startsWith("grocer")) return R.drawable.ic_qa_cart;
        if (name.startsWith("coffee")) return R.drawable.ic_qa_cup;
        if (name.startsWith("transport") || name.startsWith("fuel")) return R.drawable.ic_qa_car;
        if (name.startsWith("eating") || name.startsWith("restaurant")) return R.drawable.ic_qa_fork;
        if (name.startsWith("shopping") || name.startsWith("clothing")) return R.drawable.ic_qa_bag;
        return R.drawable.ic_qa_tag;
    }

    static void refresh(Context context) { Widgets.refreshAll(context); }

    /** After a save: the label rises to "Saved …" now, and an alarm brings the plain label back. */
    static void showSaved(Context context, String text) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, QuickAddWidget.class));
        if (ids.length == 0 || Widgets.still(context)) return;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.quick_add_widget);
        views.setTextViewText(R.id.widget_saved, text);
        views.setDisplayedChild(R.id.widget_flip, 1);
        manager.partiallyUpdateAppWidget(ids, views);
        Intent restore = new Intent(context, QuickAddWidget.class).setAction(ACTION_RESTORE_LABEL);
        PendingIntent later = PendingIntent.getBroadcast(context, 440, restore, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + SAVED_LABEL_MS, later);
    }
}

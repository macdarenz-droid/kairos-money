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
 * THE HOME-SCREEN WIDGET. Four category chips and a plus; every one of them opens the quick-add sheet
 * over the home screen, never the app. It shows no money.
 *
 * ANIMATION, WITHIN WHAT A WIDGET ALLOWS. A widget is a RemoteViews: no code runs in it, so nothing
 * can be animated by hand. Two things still move. Every chip and the plus carry a ripple, so a tap
 * answers under the finger. And the label line is a ViewFlipper, which is the one view a widget can
 * switch between children with an animation: after a save it rises in as "Saved $4.50 · Coffee", and
 * a few seconds later the plain label rises back. The amount shown is the one just typed, seconds
 * earlier, on this same screen; it is gone again before anyone else is holding the phone.
 */
public class QuickAddWidget extends AppWidgetProvider {
    /** Kept for MainActivity, which still answers this action from older widgets that were placed before the sheet existed. */
    static final String QUICK_ADD = "app.kairos.money.QUICK_ADD";
    static final String ACTION_RESTORE_LABEL = "app.kairos.money.widget.RESTORE_LABEL";
    static final String EXTRA_CATEGORY = "category";
    static final long SAVED_LABEL_MS = 6000L;
    private static final int[] CHIPS = {R.id.widget_chip_1, R.id.widget_chip_2, R.id.widget_chip_3, R.id.widget_chip_4};

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
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.quick_add_widget);
        views.setOnClickPendingIntent(R.id.widget_add, open(context, null, 420));
        String[] categories = QuickAddStore.categories(context);
        for (int i = 0; i < CHIPS.length; i++) {
            String category = i < categories.length ? categories[i] : null;
            views.setViewVisibility(CHIPS[i], category == null ? android.view.View.GONE : android.view.View.VISIBLE);
            if (category == null) continue;
            views.setTextViewText(CHIPS[i], shortLabel(category));
            views.setTextViewCompoundDrawablesRelative(CHIPS[i], icon(category), 0, 0, 0);
            views.setOnClickPendingIntent(CHIPS[i], open(context, category, 430 + i));
        }
        return views;
    }

    private static PendingIntent open(Context context, String category, int request) {
        Intent intent = new Intent(context, QuickAddActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        if (category != null) intent.putExtra(EXTRA_CATEGORY, category).setAction("app.kairos.money.QUICK_ADD." + category);
        return PendingIntent.getActivity(context, request, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        new QuickAddWidget().onUpdate(context, manager, manager.getAppWidgetIds(new ComponentName(context, QuickAddWidget.class)));
    }

    /** After a save: the label rises to "Saved …" now, and an alarm brings the plain label back. */
    static void showSaved(Context context, String text) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, QuickAddWidget.class));
        if (ids.length == 0) return;
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

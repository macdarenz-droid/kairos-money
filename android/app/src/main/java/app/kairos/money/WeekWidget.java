package app.kairos.money;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** W4, 4×2: left for today, the week's bars, category icons and add. */
public class WeekWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, Widgets.week(context));
    }
}

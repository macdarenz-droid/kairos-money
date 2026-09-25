package app.kairos.money;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.provider.Settings;
import android.widget.RemoteViews;

/** Everything the five home-screen widgets share: their look, their taps, and the week's bars. */
final class Widgets {
    private Widgets() {}
    static final Class<?>[] PROVIDERS = {QuickAddWidget.class, AddWidget.class, TodayWidget.class, WeekWidget.class, CategoryWidget.class};
    private static final int[] CATEGORY_IDS = {R.id.w_cat_1, R.id.w_cat_2, R.id.w_cat_3, R.id.w_cat_4, R.id.w_cat_5, R.id.w_cat_6};

    /** One widget style's resources, chosen in You › Appearance. */
    static final class Look {
        final int background, tap, text, meta, accent;
        Look(Context context, int background, int tap, int text, int meta, int accent) {
            this.background = background; this.tap = tap;
            this.text = context.getColor(text); this.meta = context.getColor(meta); this.accent = context.getColor(accent);
        }
    }
    static Look look(Context context) {
        switch (WidgetStore.style(context)) {
            case "paper": return new Look(context, R.drawable.widget_bg_paper, R.drawable.widget_tap_paper, R.color.widget_paper_text, R.color.widget_paper_meta, R.color.widget_paper_accent);
            case "indigo": return new Look(context, R.drawable.widget_bg_indigo, R.drawable.widget_tap_indigo, R.color.widget_indigo_text, R.color.widget_indigo_meta, R.color.widget_indigo_accent);
            default: return new Look(context, R.drawable.widget_bg_glass, R.drawable.widget_tap_glass, R.color.widget_glass_text, R.color.widget_glass_meta, R.color.widget_glass_accent);
        }
    }

    static PendingIntent open(Context context, String category, int request) {
        Intent intent = new Intent(context, QuickAddActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        if (category != null) intent.putExtra(QuickAddWidget.EXTRA_CATEGORY, category).setAction("app.kairos.money.QUICK_ADD." + category);
        return PendingIntent.getActivity(context, request, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The system's "remove animations" setting; the saved flip is skipped under it. */
    static boolean still(Context context) {
        return Settings.Global.getFloat(context.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
    }

    static void background(RemoteViews views, Look look) { views.setInt(R.id.w_root, "setBackgroundResource", look.background); }
    static void addButton(Context context, RemoteViews views, int id, Look look) {
        views.setInt(id, "setBackgroundResource", look.tap);
        views.setInt(id, "setColorFilter", look.accent);
        views.setOnClickPendingIntent(id, open(context, null, 420));
    }
    /** Icon-only category buttons, as many as the layout holds; the category name is what they say aloud. */
    static void categoryIcons(Context context, RemoteViews views, int count, Look look) {
        String[] categories = QuickAddStore.categories(context);
        for (int i = 0; i < count; i++) {
            int id = CATEGORY_IDS[i];
            String category = i < categories.length ? categories[i] : null;
            views.setViewVisibility(id, category == null ? android.view.View.INVISIBLE : android.view.View.VISIBLE);
            if (category == null) continue;
            views.setImageViewResource(id, QuickAddWidget.icon(category));
            views.setInt(id, "setBackgroundResource", look.tap);
            views.setInt(id, "setColorFilter", look.text);
            views.setContentDescription(id, category);
            views.setOnClickPendingIntent(id, open(context, category, 430 + i));
        }
    }
    static void figures(Context context, RemoteViews views, Look look, boolean spentLine) {
        String left = WidgetStore.left(context);
        views.setTextViewText(R.id.w_left, left == null ? context.getString(R.string.widget_none) : left);
        views.setTextColor(R.id.w_left, look.text);
        views.setTextColor(R.id.w_label, look.meta);
        if (!spentLine) return;
        String spent = WidgetStore.spent(context);
        views.setTextViewText(R.id.w_spent, !WidgetStore.showAmounts(context) ? context.getString(R.string.widget_amounts_hidden)
            : spent == null ? context.getString(R.string.widget_not_yet) : context.getString(R.string.widget_spent_today, spent));
        views.setTextColor(R.id.w_spent, look.meta);
    }

    /** Seven bars against the busiest day, today's in the accent; drawn once, as a picture a widget can hold. */
    static Bitmap bars(Context context, int[] heights, Look look) {
        float density = context.getResources().getDisplayMetrics().density;
        int width = Math.round(280 * density), height = Math.round(56 * density);
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        float gap = 6 * density, bar = (width - gap * 6) / 7f, radius = 3 * density, floor = 2 * density;
        for (int i = 0; i < 7; i++) {
            float top = height - Math.max(floor, height * heights[i] / 100f);
            paint.setColor(i == 6 ? look.accent : (look.meta & 0x00FFFFFF) | 0x99000000);
            canvas.drawRoundRect(new RectF(i * (bar + gap), top, i * (bar + gap) + bar, height), radius, radius, paint);
        }
        return bitmap;
    }

    static RemoteViews add(Context context) {
        Look look = look(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_add);
        background(views, look);
        views.setTextColor(R.id.w_add_label, look.text);
        views.setInt(R.id.w_logo, "setColorFilter", look.text);
        views.setOnClickPendingIntent(R.id.w_root, open(context, null, 420));
        return views;
    }
    static RemoteViews today(Context context) {
        Look look = look(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        background(views, look); figures(context, views, look, true); addButton(context, views, R.id.w_add, look);
        return views;
    }
    static RemoteViews week(Context context) {
        Look look = look(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_week);
        background(views, look); figures(context, views, look, false); addButton(context, views, R.id.w_add, look);
        views.setImageViewBitmap(R.id.w_bars, bars(context, WidgetStore.bars(context), look));
        categoryIcons(context, views, 6, look);
        return views;
    }
    static RemoteViews categories(Context context) {
        Look look = look(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_categories);
        background(views, look); categoryIcons(context, views, 4, look);
        return views;
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> provider : PROVIDERS) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
            if (ids.length == 0) continue;
            try { ((AppWidgetProvider) provider.getDeclaredConstructor().newInstance()).onUpdate(context, manager, ids); }
            catch (ReflectiveOperationException impossible) { throw new IllegalStateException(impossible); }
        }
    }
}

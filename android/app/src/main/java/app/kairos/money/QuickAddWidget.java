package app.kairos.money;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.widget.RemoteViews;

/** A launch surface only. It never opens storage or reads financial records. */
public class QuickAddWidget extends AppWidgetProvider {
    static final String QUICK_ADD="app.kairos.money.QUICK_ADD";
    @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){
        String preference=context.getSharedPreferences("kairos-appearance",Context.MODE_PRIVATE).getString("theme","system");
        boolean light=preference.equals("light")||(preference.equals("system")&&(context.getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)!=Configuration.UI_MODE_NIGHT_YES);
        for(int id:ids){
            RemoteViews views=new RemoteViews(context.getPackageName(),R.layout.quick_add_widget);
            views.setInt(R.id.widget_root,"setBackgroundResource",light?R.drawable.widget_light:R.drawable.widget_dark);
            views.setTextColor(R.id.widget_title,Color.parseColor(light?"#14171A":"#EDEEF0"));
            views.setTextColor(R.id.widget_add,Color.parseColor(light?"#14171A":"#EDEEF0"));
            Intent intent=new Intent(context,MainActivity.class).setAction(QUICK_ADD).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);
            views.setOnClickPendingIntent(R.id.widget_add,PendingIntent.getActivity(context,420,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            manager.updateAppWidget(id,views);
        }
    }
    static void refresh(Context context){AppWidgetManager manager=AppWidgetManager.getInstance(context);new QuickAddWidget().onUpdate(context,manager,manager.getAppWidgetIds(new ComponentName(context,QuickAddWidget.class)));}
}

package app.kairos.money;

import android.Manifest;
import android.os.Build;
import android.app.NotificationManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name="KairosReminder", permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class KairosReminderPlugin extends Plugin {
 @PluginMethod public void request(PluginCall call) {
  if(Build.VERSION.SDK_INT>=33 && getPermissionState("notifications")!=PermissionState.GRANTED) requestPermissionForAlias("notifications",call,"permissionResult");
  else permissionResult(call);
 }
 @PermissionCallback private void permissionResult(PluginCall call) {
  JSObject result=new JSObject(); result.put("granted",getContext().getSystemService(NotificationManager.class).areNotificationsEnabled());call.resolve(result);
 }
 @PluginMethod public void schedule(PluginCall call) {
  Long at=call.getLong("at");
  if(at==null || at<=System.currentTimeMillis() || at>System.currentTimeMillis()+16L*86400000L) {call.reject("Choose a future reminder within the next two weeks.");return;}
  ReminderReceiver.schedule(getContext(),at);call.resolve();
 }
 @PluginMethod public void cancel(PluginCall call) {ReminderReceiver.cancel(getContext());call.resolve();}
}

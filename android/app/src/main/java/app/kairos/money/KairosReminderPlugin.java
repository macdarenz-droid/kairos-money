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
 /** Reads the permission without prompting, for a switch waiting on the owner's answer in Android settings. */
 @PluginMethod public void status(PluginCall call) { permissionResult(call); }
 @PermissionCallback private void permissionResult(PluginCall call) {
  JSObject result=new JSObject(); result.put("granted",getContext().getSystemService(NotificationManager.class).areNotificationsEnabled());call.resolve(result);
 }
 @PluginMethod public void notices(PluginCall call) {try{JSArray queue=call.getArray("queue");if(queue==null)throw new IllegalArgumentException("Choose a notification schedule.");MoneyNoticeReceiver.replace(getContext(),queue);call.resolve();}catch(Exception error){call.reject(error.getMessage());}}
}

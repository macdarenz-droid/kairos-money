package app.kairos.money;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name="KairosLaunch")
public class KairosLaunchPlugin extends Plugin {
    @PluginMethod public void peek(PluginCall call){
        getActivity().runOnUiThread(()->{
            String requestId=((MainActivity)getActivity()).pendingQuickAddRequest();
            JSObject result=new JSObject();result.put("requestId",requestId==null?JSONObject.NULL:requestId);call.resolve(result);
        });
    }
    @PluginMethod public void acknowledge(PluginCall call){
        getActivity().runOnUiThread(()->{
            boolean acknowledged=((MainActivity)getActivity()).acknowledgeQuickAdd(call.getString("requestId"));
            JSObject result=new JSObject();result.put("acknowledged",acknowledged);call.resolve(result);
        });
    }
}

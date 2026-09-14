package app.kairos.money;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="KairosLaunch")
public class KairosLaunchPlugin extends Plugin {
    @PluginMethod public void consume(PluginCall call){
        getActivity().runOnUiThread(()->{
            Intent intent=getActivity().getIntent();boolean add=QuickAddWidget.QUICK_ADD.equals(intent.getAction());
            if(add)intent.setAction(Intent.ACTION_MAIN);
            JSObject result=new JSObject();result.put("addTransaction",add);call.resolve(result);
        });
    }
}

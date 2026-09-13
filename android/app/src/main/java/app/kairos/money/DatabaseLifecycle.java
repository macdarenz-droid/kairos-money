package app.kairos.money;

import android.util.Log;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import java.util.function.Consumer;

final class DatabaseLifecycle {
    private DatabaseLifecycle() {}

    static void close(Bridge bridge) {
        PluginHandle handle = bridge.getPlugin("CapacitorSQLite");
        if (handle == null || !(handle.getInstance() instanceof CapacitorSQLitePlugin)) return;
        CapacitorSQLitePlugin sqlite = (CapacitorSQLitePlugin) handle.getInstance();
        // Transactions belong to Capacitor's worker thread. Drain queued calls before cleanup;
        // Bridge.onDestroy then quits that thread safely, even if the WebView is already gone.
        bridge.execute(() -> {
            Runnable close = () -> sqlite.closeConnection(new NativeCall("closeConnection", result -> {},
                () -> Log.e("KairosStorage", "Database destruction cleanup failed.")));
            sqlite.isTransactionActive(new NativeCall("isTransactionActive", result -> {
                if (Boolean.TRUE.equals(result.getBoolean("result", false))) {
                    sqlite.rollbackTransaction(new NativeCall("rollbackTransaction", ignored -> close.run(), close));
                } else close.run();
            }, close));
        });
    }

    private static final class NativeCall extends PluginCall {
        private final Consumer<JSObject> success;
        private final Runnable failure;

        NativeCall(String method, Consumer<JSObject> success, Runnable failure) {
            super(null, "CapacitorSQLite", CALLBACK_ID_DANGLING, method,
                new JSObject().put("database", "kairos-money").put("readonly", false));
            this.success = success;
            this.failure = failure;
        }

        @Override public void resolve(JSObject result) { success.accept(result); }
        @Override public void resolve() { success.accept(new JSObject()); }
        @Override public void reject(String message, String code, Exception error, JSObject data) { failure.run(); }
    }
}

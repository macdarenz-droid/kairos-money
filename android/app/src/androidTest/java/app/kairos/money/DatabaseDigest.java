package app.kairos.money;

import android.database.Cursor;
import androidx.sqlite.db.SupportSQLiteDatabase;
import com.getcapacitor.community.database.sqlite.CapacitorSQLite;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import com.getcapacitor.community.database.sqlite.SQLite.Database;
import java.lang.reflect.Field;
import java.util.Dictionary;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Canonical, typed digest of every non-internal SQLite table on the test device. */
final class DatabaseDigest {
    private DatabaseDigest() {}
    private static void field(MessageDigest digest, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array()); digest.update(bytes);
    }
    private interface Read<T> { T run(SupportSQLiteDatabase db) throws Exception; }
    /** Read the real SQLCipher connection on its owning worker, without opening a competing connection. */
    private static <T> T snapshot(MainActivity activity, Read<T> read) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<T> result = new AtomicReference<>();
        AtomicReference<Exception> failure = new AtomicReference<>();
        activity.getBridge().execute(() -> {
            try {
                Object plugin = activity.getBridge().getPlugin("CapacitorSQLite").getInstance();
                Field implementation = CapacitorSQLitePlugin.class.getDeclaredField("implementation");
                implementation.setAccessible(true);
                Field connections = CapacitorSQLite.class.getDeclaredField("dbDict");
                connections.setAccessible(true);
                Dictionary<?, ?> dictionary = (Dictionary<?, ?>) connections.get(implementation.get(plugin));
                Database connection = (Database) dictionary.get("RW_kairos-money");
                if (connection == null) throw new IllegalStateException("Kairos database connection is not open.");
                SupportSQLiteDatabase db = connection.getDb();
                if (db.inTransaction()) throw new IllegalStateException("Ledger writes have not finished before the acceptance snapshot.");
                db.beginTransaction();
                try { result.set(read.run(db)); db.setTransactionSuccessful(); }
                finally { db.endTransaction(); }
            } catch (Exception error) { failure.set(error); }
            finally { done.countDown(); }
        });
        if (!done.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("Database snapshot timed out.");
        if (failure.get() != null) throw failure.get();
        return result.get();
    }
    static String hash(MainActivity activity) throws Exception {
        return snapshot(activity, DatabaseDigest::hashConnection);
    }
    private static String hashConnection(SupportSQLiteDatabase db) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        {
            List<String> tables = new ArrayList<>();
            try (Cursor cursor = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
                while (cursor.moveToNext()) tables.add(cursor.getString(0));
            }
            for (String table : tables) {
                field(digest, "table:" + table); List<String> rows = new ArrayList<>();
                String quoted = "\"" + table.replace("\"", "\"\"") + "\"";
                try (Cursor cursor = db.query("SELECT * FROM " + quoted)) {
                    for (String column : cursor.getColumnNames()) field(digest, "column:" + column);
                    while (cursor.moveToNext()) {
                        StringBuilder row = new StringBuilder();
                        for (int i = 0; i < cursor.getColumnCount(); i++) {
                            if (cursor.isNull(i)) row.append("N;");
                            else if (cursor.getType(i) == Cursor.FIELD_TYPE_INTEGER) row.append('I').append(cursor.getLong(i)).append(';');
                            else if (cursor.getType(i) == Cursor.FIELD_TYPE_STRING) {
                                String value = cursor.getString(i); row.append('S').append(value.length()).append(':').append(value).append(';');
                            } else if (cursor.getType(i) == Cursor.FIELD_TYPE_BLOB) {
                                String value = Base64.encodeToString(cursor.getBlob(i), Base64.NO_WRAP); row.append('B').append(value.length()).append(':').append(value).append(';');
                            } else throw new IllegalStateException("A floating-point value exists in " + table + ".");
                        }
                        rows.add(row.toString());
                    }
                }
                Collections.sort(rows); for (String row : rows) field(digest, row);
            }
        }
        StringBuilder result = new StringBuilder(); for (byte value : digest.digest()) result.append(String.format("%02x", value & 0xff)); return result.toString();
    }
    static long userRows(MainActivity activity) throws Exception {
        return snapshot(activity, db -> {
        long total = 0;
        try (Cursor tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_migrations','categories','app_settings')")) {
            while (tables.moveToNext()) try (Cursor count = db.query("SELECT COUNT(*) FROM \"" + tables.getString(0).replace("\"", "\"\"") + "\"")) {
                if (!count.moveToFirst()) throw new IllegalStateException("Could not count " + tables.getString(0) + "."); total += count.getLong(0);
            }
        }
        return total;
        });
    }
}

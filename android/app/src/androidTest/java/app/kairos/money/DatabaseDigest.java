package app.kairos.money;

import android.content.Context;
import android.database.Cursor;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.sqlcipher.database.SQLiteDatabase;

/** Canonical, typed digest of every non-internal SQLite table on the test device. */
final class DatabaseDigest {
    private DatabaseDigest() {}
    private static void field(MessageDigest digest, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array()); digest.update(bytes);
    }
    static String hash(Context context, String secret) throws Exception {
        SQLiteDatabase.loadLibs(context);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath("kairos-moneySQLite.db").getPath(), secret, null, SQLiteDatabase.OPEN_READONLY)) {
            List<String> tables = new ArrayList<>();
            try (Cursor cursor = db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", null)) {
                while (cursor.moveToNext()) tables.add(cursor.getString(0));
            }
            for (String table : tables) {
                field(digest, "table:" + table); List<String> rows = new ArrayList<>();
                String quoted = "\"" + table.replace("\"", "\"\"") + "\"";
                try (Cursor cursor = db.rawQuery("SELECT * FROM " + quoted, null)) {
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
    static long userRows(Context context, String secret) {
        SQLiteDatabase.loadLibs(context); long total = 0;
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath("kairos-moneySQLite.db").getPath(), secret, null, SQLiteDatabase.OPEN_READONLY);
             Cursor tables = db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations','categories','app_settings')", null)) {
            while (tables.moveToNext()) try (Cursor count = db.rawQuery("SELECT COUNT(*) FROM \"" + tables.getString(0).replace("\"", "\"\"") + "\"", null)) {
                if (!count.moveToFirst()) throw new IllegalStateException("Could not count " + tables.getString(0) + "."); total += count.getLong(0);
            }
        }
        return total;
    }
}

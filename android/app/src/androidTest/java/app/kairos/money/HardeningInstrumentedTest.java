package app.kairos.money;

import static org.junit.Assert.*;

import android.content.Context;
import android.database.Cursor;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import net.sqlcipher.database.SQLiteDatabase;
import net.sqlcipher.database.SQLiteException;
import net.sqlcipher.database.SQLiteFullException;
import org.junit.Test;

public class HardeningInstrumentedTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private int count(SQLiteDatabase db) {
        try (Cursor cursor = db.rawQuery("SELECT COUNT(*) FROM proof", null)) {
            assertTrue(cursor.moveToFirst());
            return cursor.getInt(0);
        }
    }

    @Test public void encryptedTransactionRollsBackWhenDatabaseIsFull() throws Exception {
        SQLiteDatabase.loadLibs(context);
        File path = context.getDatabasePath("synthetic-low-storage.db");
        context.deleteDatabase(path.getName());
        String secret = "synthetic-low-storage-secret";
        SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(path, secret, null);
        try {
            db.execSQL("CREATE TABLE proof(id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
            db.execSQL("INSERT INTO proof(label) VALUES ('STABLE SYNTHETIC RECORD')");
            int pages;
            try (Cursor cursor = db.rawQuery("PRAGMA page_count", null)) {
                assertTrue(cursor.moveToFirst()); pages = cursor.getInt(0);
            }
            try (Cursor cursor = db.rawQuery("PRAGMA max_page_count=" + pages, null)) {
                assertTrue(cursor.moveToFirst()); assertEquals(pages, cursor.getInt(0));
            }
            String large = new String(new char[64 * 1024]).replace('\0', 'x');
            boolean full = false;
            db.beginTransaction();
            try {
                for (int i = 0; i < 32; i++) db.execSQL("INSERT INTO proof(label) VALUES (?)", new Object[]{large + i});
                db.setTransactionSuccessful();
            } catch (SQLiteException error) {
                full = error instanceof SQLiteFullException || String.valueOf(error.getMessage()).toLowerCase().contains("full");
            } finally {
                db.endTransaction();
            }
            assertTrue("The bounded database did not report a storage-full failure", full);
            assertEquals("A failed transaction left partial records", 1, count(db));
        } finally {
            db.close();
        }
        db = SQLiteDatabase.openDatabase(path.getPath(), secret, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            assertEquals("The stable record did not survive reopening", 1, count(db));
        } finally {
            db.close();
        }
        String raw = new String(Files.readAllBytes(path.toPath()), StandardCharsets.ISO_8859_1);
        assertFalse("Encrypted low-storage fixture leaked its stable record", raw.contains("STABLE SYNTHETIC RECORD"));
        assertTrue(context.deleteDatabase(path.getName()));
    }
}

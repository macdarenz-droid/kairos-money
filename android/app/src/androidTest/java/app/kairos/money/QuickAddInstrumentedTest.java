package app.kairos.money;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Collections;

/**
 * The home-screen quick add: what its keypad accepts, what its outbox keeps, and what the widget shows.
 * These run on the device because the store is Android's own, written from outside the app.
 */
@RunWith(AndroidJUnit4.class)
public class QuickAddInstrumentedTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Before public void clearStore() {
        context.getSharedPreferences(QuickAddStore.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(WidgetStore.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test public void theKeypadTypesOneHonestAmount() {
        String amount = "";
        for (String key : new String[]{"0", "0", "4", ".", "5", "0", "1"}) amount = QuickAddActivity.press(amount, key);
        assertEquals("No leading zeros, one point, two decimals at most", "4.50", amount);
        assertEquals("0.", QuickAddActivity.press("", "."));
        assertEquals("4.", QuickAddActivity.press("4.", "."));
        assertEquals("123456789", QuickAddActivity.press("123456789", "0"));
        assertEquals("", QuickAddActivity.press("", "back"));
        assertEquals("4", QuickAddActivity.press("4.", "back"));
        assertFalse(QuickAddActivity.saveable("0"));
        assertFalse(QuickAddActivity.saveable("0."));
        assertTrue(QuickAddActivity.saveable("0.01"));
    }

    @Test public void theOutboxKeepsWhatWasTypedUntilTheAppTakesIt() throws Exception {
        JSONObject config = new JSONObject();
        config.put("accountId", "synthetic-everyday"); config.put("accountName", "Everyday"); config.put("currency", "PHP");
        config.put("categories", new JSONArray(new String[]{"Groceries", "Coffee & snacks"}));
        QuickAddStore.configure(context, config);
        assertArrayEquals(new String[]{"Groceries", "Coffee & snacks"}, QuickAddStore.categories(context));

        assertNull("An amount of nothing is not kept", QuickAddStore.add(context, "0", "spent", null));
        assertNull("A direction the ledger does not know is not kept", QuickAddStore.add(context, "4.50", "sideways", null));
        String id = QuickAddStore.add(context, "4.50", "spent", "Coffee & snacks");
        assertNotNull(id);
        JSONArray held = QuickAddStore.pending(context);
        assertEquals(1, held.length());
        JSONObject entry = held.getJSONObject(0);
        assertEquals("The amount is kept exactly as typed; the ledger does the arithmetic", "4.50", entry.getString("amount"));
        assertEquals("PHP", entry.getString("currency"));
        assertEquals("synthetic-everyday", entry.getString("accountId"));
        assertEquals("Coffee & snacks", entry.getString("category"));

        QuickAddStore.clear(context, Collections.singletonList(id));
        assertEquals("Taken by the app, it is gone", 0, QuickAddStore.pending(context).length());

        for (int i = 0; i < QuickAddStore.LIMIT - 1; i++) assertNotNull(QuickAddStore.add(context, "1", "spent", null));
        assertFalse("One place left is not full", QuickAddStore.full(context));
        assertNotNull(QuickAddStore.add(context, "1", "spent", null));
        assertTrue("A full outbox says so, so the sheet can tell the owner", QuickAddStore.full(context));
        assertNull("A full outbox keeps nothing more", QuickAddStore.add(context, "1", "spent", null));
        assertEquals(QuickAddStore.LIMIT, QuickAddStore.pending(context).length());
    }

    @Test public void theWidgetShowsOneWordAndAnIconForEachChip() {
        assertEquals("Coffee", QuickAddWidget.shortLabel("Coffee & snacks"));
        assertEquals("Groceries", QuickAddWidget.shortLabel("Groceries"));
        assertEquals(R.drawable.ic_qa_cup, QuickAddWidget.icon("Coffee & snacks"));
        assertEquals(R.drawable.ic_qa_car, QuickAddWidget.icon("Transport"));
        assertEquals("A category without an icon of its own gets the tag", R.drawable.ic_qa_tag, QuickAddWidget.icon("Pets"));
        assertNotNull("The widget builds without a configured account", QuickAddWidget.build(context));
    }

    @Test public void everyWidgetBuildsInEachStyleAndAmountsLeaveWhenHidden() {
        assertEquals("glass", WidgetStore.style(context)); assertTrue(WidgetStore.showAmounts(context));
        WidgetStore.figures(context, "$42.10", "$18.00", new int[]{0, 13, 0, 50, 4, 25, 100});
        assertEquals("$42.10", WidgetStore.left(context)); assertArrayEquals(new int[]{0, 13, 0, 50, 4, 25, 100}, WidgetStore.bars(context));
        for (String style : WidgetStore.STYLES) {
            WidgetStore.settings(context, style, true);
            // A launcher inflates these; any view or call it refuses shows "Can't load widget" instead.
            renders(style + " W2", QuickAddWidget.build(context)); renders(style + " W1", Widgets.add(context));
            renders(style + " W3", Widgets.today(context)); renders(style + " W4", Widgets.week(context));
            renders(style + " W5", Widgets.categories(context));
        }
        WidgetStore.settings(context, "glass", false);
        assertNull("Hidden amounts are removed, not just covered", WidgetStore.left(context));
        assertNull(context.getSharedPreferences(WidgetStore.PREFS, Context.MODE_PRIVATE).getString("left", null));
        assertArrayEquals(new int[7], WidgetStore.bars(context));
        WidgetStore.figures(context, "$1.00", "$2.00", new int[7]);
        assertNull("Nothing is written while amounts are off", WidgetStore.left(context));
        assertThrows(IllegalArgumentException.class, () -> WidgetStore.settings(context, "neon", true));
    }

    private void renders(String name, android.widget.RemoteViews views) {
        Throwable[] failure = new Throwable[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            try {
                assertNotNull(views.apply(context, new android.widget.FrameLayout(context)));
                // A launcher applies with a restricted context made for this app, not the app's own.
                Context remote = context.createApplicationContext(context.getApplicationInfo(), Context.CONTEXT_RESTRICTED);
                assertNotNull(views.apply(remote, new android.widget.FrameLayout(context)));
            } catch (Throwable error) { failure[0] = error; }
        });
        if (failure[0] != null) {
            StringBuilder why = new StringBuilder(name + " does not render:");
            for (Throwable t = failure[0]; t != null; t = t.getCause()) why.append(" ").append(t);
            fail(why.toString());
        }
    }
}

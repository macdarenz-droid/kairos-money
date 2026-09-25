package app.kairos.money;

import static org.junit.Assert.*;
import javax.crypto.AEADBadTagException;
import org.junit.Test;

public class PinWrapTest {
    private static final String SECRET = "c3ludGhldGljLWRhdGFiYXNlLWtleS1mb3ItdGVzdHM=";

    @Test public void theRightPinOpensTheDatabaseKeyOnItsOwn() throws Exception {
        byte[] salt = PinWrap.salt();
        String sealed = PinWrap.seal(PinWrap.deriveKey("246810", salt), SECRET);
        assertFalse("The key must not be stored in the clear", sealed.contains(SECRET));
        assertEquals(SECRET, PinWrap.open(PinWrap.deriveKey("246810", salt), sealed));
    }

    @Test public void aWrongPinOrSaltOpensNothing() throws Exception {
        byte[] salt = PinWrap.salt();
        String sealed = PinWrap.seal(PinWrap.deriveKey("246810", salt), SECRET);
        assertThrows(AEADBadTagException.class, () -> PinWrap.open(PinWrap.deriveKey("246811", salt), sealed));
        assertThrows(AEADBadTagException.class, () -> PinWrap.open(PinWrap.deriveKey("246810", PinWrap.salt()), sealed));
    }

    @Test public void aDamagedWrapIsRefused() throws Exception {
        byte[] key = PinWrap.deriveKey("246810", PinWrap.salt());
        String sealed = PinWrap.seal(key, SECRET);
        String flipped = sealed.substring(0, sealed.length() - 2) + (sealed.charAt(sealed.length() - 2) == 'A' ? "B" : "A") + sealed.charAt(sealed.length() - 1);
        assertThrows(AEADBadTagException.class, () -> PinWrap.open(key, flipped));
        assertThrows(AEADBadTagException.class, () -> PinWrap.open(key, "not-a-wrap"));
    }

    @Test public void eachSealUsesAFreshNonce() throws Exception {
        byte[] key = PinWrap.deriveKey("246810", PinWrap.salt());
        assertNotEquals(PinWrap.seal(key, SECRET), PinWrap.seal(key, SECRET));
    }
}

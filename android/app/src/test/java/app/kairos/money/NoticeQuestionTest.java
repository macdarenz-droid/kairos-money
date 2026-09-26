package app.kairos.money;

import static org.junit.Assert.*;
import org.junit.Test;

public class NoticeQuestionTest {
    @Test public void aSecurityMessageIsCapturedButNotAskedAbout() {
        assertFalse(NoticeQuestion.asks("CommBank", "A security code was used to log in to NetBank."));
        assertFalse(NoticeQuestion.asks("Synthetic Bank", "Your one-time passcode is 123456."));
        assertFalse(NoticeQuestion.asks("Sign in", "New device"));
        assertFalse(NoticeQuestion.asks("Synthetic Bank", "You spent $15.00 at CAFE MIKA. Log\n in to the app for details."));
    }

    @Test public void aPurchaseIsAskedAbout() {
        assertTrue(NoticeQuestion.asks("CommBank", "You spent $12.50 at WOOLWORTHS 1234."));
        assertTrue(NoticeQuestion.asks(null, "You have received $50.00 from JANE D."));
        assertTrue(NoticeQuestion.asks("Synthetic Bank", "Payment to LOGINOVA PTY $20.00"));
    }

    @Test public void aNoticeWithoutAnAmountIsNotAskedAbout() {
        assertFalse(NoticeQuestion.asks("Synthetic Bank", "Download in progress."));
        assertFalse(NoticeQuestion.asks("Synthetic Bank", "Your statement for 2026 is ready."));
        assertTrue(NoticeQuestion.asks("Synthetic Bank", "Card purchase AUD 40 at CAFE MIKA"));
        assertTrue(NoticeQuestion.asks("Synthetic Bank", "Purchase 8.20 at KIOSK 12"));
        assertTrue(NoticeQuestion.asks("Synthetic Bank", "Card purchase of 11.95."));
        assertFalse(NoticeQuestion.asks("Synthetic Bank", "Version 1.2.30 installed."));
    }

    @Test public void aPesoAmountIsAskedAbout() {
        assertTrue(NoticeQuestion.asks("Synthetic Wallet", "You have received \u20b11,200 from SYNTHETIC PAYEE."));
        assertTrue(NoticeQuestion.asks("Synthetic Wallet", "You have sent Php 500 to SYNTHETIC MERCHANT."));
    }
}

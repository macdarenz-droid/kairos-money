export type RoutableAccount = {id: string; mask_last4: string | null};

/**
 * Digits a bank prints to say which account a notification is about.
 *
 * Only after a word that means "this identifies the account". A bare run of digits is not enough: an
 * amount, a receipt number and a store number are all digits, and "WITHDRAWAL-OSKO PAYMENT 4471902" would
 * otherwise route money by its reference number. "ending 407", "acct ••3318", "card x1234" are claims
 * about identity; "$3.00" is not.
 */
const IDENTIFIER = /\b(?:ending(?:\s+in)?|acct\.?|account|card|a\/c)\b[^0-9a-zA-Z]{0,12}(\d{3,4})\b/gi;

/**
 * Which of the owner's accounts a notification is about, or null when the text does not say.
 *
 * Banks do not agree on how many digits to print — CommBank says "ending 407", others print all four — so
 * a three-digit tail is matched as a suffix of the stored mask rather than as an equal string. That is a
 * looser test, which is why an ambiguous answer is refused: if two accounts both end 407, the notice has
 * not identified either and the caller falls back to the account the owner chose.
 *
 * Returning null is the normal case, not a failure. Most notifications name no account at all, and an
 * account guessed from a reference number would put real money on the wrong ledger.
 */
export function accountFromNotice(text: string, accounts: readonly RoutableAccount[]): string | null {
  const masked = accounts.filter(account => account.mask_last4);
  if (!masked.length) return null;

  const matched = new Set<string>();
  for (const found of text.matchAll(IDENTIFIER)) {
    const digits = found[1]!;
    for (const account of masked) if (account.mask_last4!.endsWith(digits)) matched.add(account.id);
  }
  // One account, named once or several times, is an answer. Two different accounts is not.
  return matched.size === 1 ? [...matched][0]! : null;
}

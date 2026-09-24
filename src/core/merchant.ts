/** One merchant key for rules, repeats and the brain: card words, references, dates and city suffixes removed. */
export function merchantName(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/\b(?:EFTPOS|POS|VISA|MASTERCARD|DEBIT CARD|CREDIT CARD)\b/g, ' ').replace(/\b(?:TERMINAL|STORE|REF|REFERENCE|AUTH|TID)\s*[#:]?\s*[A-Z0-9-]+\b/g, ' ').replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, ' ').replace(/\b\d{5,}\b/g, ' ').replace(/\s+(?:MELBOURNE|SYDNEY|BRISBANE|PERTH|ADELAIDE)(?:\s+(?:VIC|NSW|QLD|WA|SA))?$/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
}

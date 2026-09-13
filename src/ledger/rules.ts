import { merchantName } from '../ingest/normalize';
import type { NormalizedRow } from '../ingest/types';
export type CategoryRule = { id: string; priority: number; merchant: string; category: string };
export function categorize(row: NormalizedRow, rules: readonly CategoryRule[], defaults: Readonly<Record<string, string>> = {}, mcc: string | null = null): { category: string | null; confidence: number; reason: string } {
  const rule = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)).find(r => merchantName(r.merchant) === row.merchant);
  if (rule) return { category: rule.category, confidence: 10000, reason: 'Your merchant rule' };
  if (defaults[row.merchant]) return { category: defaults[row.merchant]!, confidence: 9500, reason: 'Confirmed merchant default' };
  const mccCategories: Record<string, string> = { '5411': 'Groceries', '5541': 'Transport', '5812': 'Eating out', '4900': 'Utilities' };
  if (mcc && mccCategories[mcc]) return { category: mccCategories[mcc]!, confidence: 9200, reason: `Merchant category code ${mcc}` };
  const hint = /\b(?:SUPERMARKET|WOOLWORTHS|COLES|ALDI)\b/.test(row.merchant) ? 'Groceries' : /\b(?:SALARY|PAYROLL|WAGES)\b/.test(row.merchant) && BigInt(row.minor) > 0n ? 'Income' : null;
  return { category: hint, confidence: hint ? 7000 : 0, reason: hint ? 'Suggested from description; confirm before applying' : 'Uncategorised; choose a category' };
}

import { normalizeAmount, normalizeDate } from '../normalize';
import type { ImportContext, Payslip } from '../types';
import { ImportFailure } from '../types';
export function parsePayslip(text: string, context: ImportContext): Payslip {
  const field = (names: string, required = true) => { const v = new RegExp(`^(?:${names})\\s*[:|]\\s*(.+)$`, 'im').exec(text)?.[1]?.trim(); if (!v && required) throw new ImportFailure('Payslip labels were detected.', `The ${names.split('|')[0]} field could not be read.`, text.slice(0, 500), 'Use a payslip with labelled employer, pay date, gross, net, tax and super fields.'); return v ?? ''; };
  const amount = (labels: string) => normalizeAmount(field(labels), context.currency, context.decimal).toString();
  const entries = (label: string) => [...text.matchAll(new RegExp(`^${label}\\s+([^:|]+)[:|]\\s*(.+)$`, 'gim'))].map(m => ({ name: m[1]!.trim(), minor: normalizeAmount(m[2]!, context.currency, context.decimal).toString() }));
  const ytd = Object.fromEntries(entries('YTD').map(e => [e.name, e.minor]));
  return { employer: field('Employer|Company'), payDate: normalizeDate(field('Pay date|Payment date'), context.period, context.dateOrder), period: { start: normalizeDate(field('Period start|Pay period start'), context.period, context.dateOrder), end: normalizeDate(field('Period end|Pay period end'), context.period, context.dateOrder) }, currency: context.currency, gross: amount('Gross|Gross pay|Gross earnings'), net: amount('Net|Net pay|Net payment'), tax: amount('Tax|PAYG|Tax withheld'), super: amount('Super|Superannuation|Pension'), deductions: entries('Deduction'), allowances: entries('Allowance'), ytd };
}
export { payCycle, linkNet, payMetrics } from '../../ledger/payslips';

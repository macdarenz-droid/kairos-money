import type { Currency } from '../core/money';
import type { AccountKind } from '../core/db/repository';
export type Period = { start: string; end: string };
export type ImportContext = { accountId: string; accountKind: AccountKind; currency: Currency; period: Period; dateOrder: 'DMY' | 'MDY'; decimal: '.' | ','; creditPositivePurchases: boolean };
export type RawRow = { sourceId: string; date: string; description: string; amount: string; direction?: 'debit' | 'credit'; reference?: string; pending?: boolean; runningBalance?: string; mcc?: string; confidence: number };
export type NormalizedRow = { sourceId: string; accountId: string; date: string; description: string; merchant: string; minor: string; currency: Currency; reference: string; pending: boolean; status?: 'pending' | 'settled'; runningBalance?: string; confidence: number; fingerprint: string; issues: string[]; category: string | null; verified: boolean; duplicateOf: string | null; occurrence: string; createRule: boolean; mcc: string | null };
export type Payslip = { employer: string; payDate: string; period: Period; currency: Currency; gross: string; net: string; tax: string; super: string; deductions: { name: string; minor: string }[]; allowances: { name: string; minor: string }[]; ytd: Record<string, string> };
export type Document = { id: string; hash: string; fileName: string; parser: string; context: ImportContext; opening: string; closing: string; rows: NormalizedRow[]; payslip: Payslip | null; sessionId?: string; sourceRank?: number; sourceKind?: 'statement' | 'export'; integrityTier?: 'A' | 'B' | 'C'; rawRows?: RawRow[]; sourceText?: string };
export type Batch = Document & { status: 'staged' | 'committed' | 'rolled_back' | 'quarantined' };
export type BatchSummary = Pick<Batch, 'id' | 'fileName' | 'status' | 'integrityTier' | 'sessionId' | 'payslip'> & {
  context: Pick<ImportContext, 'accountId' | 'period'>;
};
export type LedgerRow = NormalizedRow & { id: string; owner: string; transferGroup: string | null; sources: { batchId: string; sourceId: string }[] };
export class ImportFailure extends Error {
  constructor(public understood: string, public unreadable: string, public excerpt: string, public action: string) { super(`${unreadable} ${action}`); this.name = 'ImportFailure'; }
}

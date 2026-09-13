import type { Document, ImportContext } from '../types';
export type ColumnRole = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'reference' | 'status';
export type ExportMapping = { columns: Partial<Record<ColumnRole, number>>; header: boolean; dateOrder: 'DMY' | 'MDY'; signature: string };
export type SourceOptions = { context: ImportContext; opening: string; closing: string; payslip: boolean; mapping?: ExportMapping; aliases?: readonly { canonical: string; aliases: string[] }[] };
export interface TransactionSource {
  readonly identity: string;
  readonly capabilities: { dateBounded: boolean; balanceAuthoritative: boolean; pendingAware: boolean };
  fetch(options: SourceOptions, progress?: (message: string) => void): Promise<Document>;
}

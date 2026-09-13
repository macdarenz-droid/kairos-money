import type { TransactionSource, SourceOptions } from './types';
import type { Document } from '../types';
export const sourceFeatures = Object.freeze({ cdr: false, statementEmail: false });
export class CdrSource implements TransactionSource {
  readonly identity = 'cdr';
  readonly capabilities = { dateBounded: true, balanceAuthoritative: false, pendingAware: true };
  async fetch(_options: SourceOptions): Promise<Document> { void _options; throw new Error('Bank connection is not available in this build. Import a transaction export instead.'); }
}

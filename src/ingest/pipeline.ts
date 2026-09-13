// Backward-compatible statement entry point; extraction and parsing live inside FileSource.
import { FileSource, documentFromExtracted } from './sources';
import type { ImportContext } from './types';
export const buildDocument = documentFromExtracted;
export async function prepare(bytes: Uint8Array, fileName: string, context: ImportContext, opening: string, closing: string, payslip: boolean, progress: (message: string) => void) {
 return new FileSource(bytes, fileName).fetch({ context, opening, closing, payslip }, progress);
}

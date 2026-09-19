import { ImportFailure } from '../types';
import { isLegacyExcel } from '../extract/xls';
export type FileKind = 'pdf' | 'csv' | 'xls' | 'xlsx' | 'ofx' | 'qif' | 'image';
export function detect(bytes: Uint8Array, name: string): { kind: FileKind; issuer: string | null } {
  const text = new TextDecoder().decode(bytes.slice(0, 8192));
  const issuer = /COMMONWEALTH BANK/i.test(text) ? 'commbank' : /ANZ BANK/i.test(text) ? 'anz' : /WESTPAC/i.test(text) ? 'westpac' : null;
  let kind: FileKind;
  if (text.startsWith('%PDF-')) kind = 'pdf';
  else if ((bytes[0] === 137 && bytes[1] === 80) || (bytes[0] === 255 && bytes[1] === 216)) kind = 'image';
  else if (bytes[0] === 80 && bytes[1] === 75 && /\.xlsx$/i.test(name)) kind = 'xlsx';
  // Legacy Excel is OLE2, recognised by its own magic rather than by the extension: banks label these
  // .xls, .XLS and occasionally .xlsx, and the bytes are the only honest answer.
  else if (isLegacyExcel(bytes)) kind = 'xls';
  else if (/<OFX[>\s]|OFXHEADER:/i.test(text)) kind = 'ofx';
  else if (/^!Type:/m.test(text)) kind = 'qif';
  else if (/\.(csv|tsv|txt)$/i.test(name) && !text.includes('\0')) kind = 'csv';
  else throw new ImportFailure(`File: ${name}`, 'This file format could not be identified.', text.slice(0, 160), 'Choose a PDF, CSV, XLS, XLSX, OFX, QIF, PNG or JPEG statement.');
  return { kind, issuer };
}

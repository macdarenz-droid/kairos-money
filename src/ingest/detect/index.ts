import { ImportFailure } from '../types';
export type FileKind = 'pdf' | 'csv' | 'xlsx' | 'ofx' | 'qif' | 'image';
export function detect(bytes: Uint8Array, name: string): { kind: FileKind; issuer: string | null } {
  const text = new TextDecoder().decode(bytes.slice(0, 8192));
  const issuer = /COMMONWEALTH BANK/i.test(text) ? 'commbank' : /ANZ BANK/i.test(text) ? 'anz' : /WESTPAC/i.test(text) ? 'westpac' : null;
  let kind: FileKind;
  if (text.startsWith('%PDF-')) kind = 'pdf';
  else if ((bytes[0] === 137 && bytes[1] === 80) || (bytes[0] === 255 && bytes[1] === 216)) kind = 'image';
  else if (bytes[0] === 80 && bytes[1] === 75 && /\.xlsx$/i.test(name)) kind = 'xlsx';
  else if (/<OFX[>\s]|OFXHEADER:/i.test(text)) kind = 'ofx';
  else if (/^!Type:/m.test(text)) kind = 'qif';
  else if (/\.(csv|tsv|txt)$/i.test(name) && !text.includes('\0')) kind = 'csv';
  else throw new ImportFailure(`File: ${name}`, 'This file format could not be identified.', text.slice(0, 160), 'Choose a PDF, CSV, XLSX, OFX, QIF, PNG or JPEG statement.');
  return { kind, issuer };
}

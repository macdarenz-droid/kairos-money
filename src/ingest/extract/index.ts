import { registerPlugin } from '@capacitor/core';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { detect } from '../detect';
import { ImportFailure } from '../types';
import { textLines, type TextItem } from '../parse/positional';
import { csvRows } from '../parse/csv';
import { extractXlsx } from './xlsx';
GlobalWorkerOptions.workerSrc = pdfWorker;
export type Extracted = { kind: ReturnType<typeof detect>['kind']; text: string; items: TextItem[]; table: string[][] | null; ocr: boolean; issuer: string | null };
export const OfflineText = registerPlugin<{ recognize(options: { base64: string }): Promise<{ items: { text: string; x: number; y: number; width: number }[] }> }>('KairosText');
function base64(bytes: Uint8Array): string { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); }
async function extractLocal(bytes: Uint8Array, fileName: string, progress: (message: string) => void = () => undefined): Promise<Extracted> {
  if (bytes.length > 20971520) throw new ImportFailure('The file was selected.', 'This file exceeds the 20 MB import limit.', fileName, 'Split the statement into smaller files or export CSV.');
  const detected = detect(bytes, fileName); const result: Extracted = { ...detected, text: '', items: [], table: null, ocr: false };
  if (detected.kind === 'xlsx') { result.table = extractXlsx(bytes); result.text = result.table.map(r => r.join(' | ')).join('\n'); return result; }
  if (['csv', 'ofx', 'qif'].includes(detected.kind)) { result.text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (detected.kind === 'csv') result.table = csvRows(result.text); return result; }
  if (detected.kind === 'image') { progress('Reading image on this device'); result.ocr = true; result.items = (await OfflineText.recognize({ base64: base64(bytes) })).items.map(i => ({ ...i, page: 1 })); }
  else {
    const task = getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
    try {
      const pdf = await task.promise; if (pdf.numPages > 100) throw new Error('This PDF exceeds 100 pages. Split it into smaller statements.');
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        progress(`Reading page ${pageNumber} of ${pdf.numPages}`);
        const page = await pdf.getPage(pageNumber); const content = await page.getTextContent(); const viewport = page.getViewport({ scale: 1 });
        const items: TextItem[] = content.items.flatMap(item => 'str' in item && item.str.trim() ? [{ text: item.str.trim(), x: item.transform[4] as number, y: viewport.height - (item.transform[5] as number), width: item.width, page: pageNumber }] : []);
        if (items.reduce((s, i) => s + i.text.length, 0) < 50) {
          result.ocr = true; progress(`Recognising scanned page ${pageNumber} of ${pdf.numPages}`);
          const view = page.getViewport({ scale: Math.min(3, 2200 / Math.max(viewport.width, viewport.height)) });
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height); const context = canvas.getContext('2d'); if (!context) throw new Error('The scanned page could not be rendered. Choose an image or CSV instead.');
          try { await page.render({ canvasContext: context, viewport: view }).promise; const recognized = await OfflineText.recognize({ base64: canvas.toDataURL('image/png').split(',')[1]! }); result.items.push(...recognized.items.map(i => ({ ...i, page: pageNumber }))); } finally { canvas.width = 0; canvas.height = 0; }
        } else result.items.push(...items);
        page.cleanup(); await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    } finally { await task.destroy(); }
  }
  result.text = textLines(result.items).map(line => line.items.map(i => i.text).join(' ')).join('\n');
  if (!result.text.trim()) throw new ImportFailure('The document opened.', 'No readable text was found.', fileName, 'Choose a sharper scan or request a CSV statement.');
  return result;
}

export async function extract(bytes: Uint8Array, fileName: string, progress: (message: string) => void = () => undefined): Promise<Extracted> {
  try { return await extractLocal(bytes, fileName, progress); }
  catch (error) { if (error instanceof ImportFailure) throw error; throw new ImportFailure(`Selected file: ${fileName}`, error instanceof Error ? error.message : 'Local extraction did not complete.', fileName, 'Save a readable, unlocked local copy and import it again.'); }
}

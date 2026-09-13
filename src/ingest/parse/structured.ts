import type { RawRow } from '../types';
import { ImportFailure } from '../types';
export function parseOfx(text: string): RawRow[] {
  const field = (block: string, tag: string) => new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i').exec(block)?.[1]?.trim() ?? '';
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi)];
  if (!blocks.length) throw new ImportFailure('The OFX header was read.', 'No statement transaction records were found.', text.slice(0, 160), 'Export an account statement as OFX again.');
  return blocks.map((match, i) => { const block = match[1]!, date = field(block, 'DTPOSTED').slice(0, 8); return { sourceId: String(i), date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, amount: field(block, 'TRNAMT'), description: [field(block, 'NAME'), field(block, 'MEMO')].filter(Boolean).join(' '), reference: field(block, 'FITID'), direction: field(block, 'TRNAMT').startsWith('-') ? 'debit' : 'credit', confidence: 10000 }; });
}
export function parseQif(text: string): RawRow[] {
  const result: RawRow[] = [];
  for (const block of text.replace(/\r/g, '').split('\n^')) {
    const lines = block.split('\n'); const field = (tag: string) => lines.find(l => l.startsWith(tag))?.slice(1).trim() ?? '';
    if (!field('D') && !field('T')) continue;
    if (lines.some(l => l.startsWith('$') || l.startsWith('S'))) throw new ImportFailure('QIF records were read.', 'This export contains split transactions.', block.slice(0, 200), 'Export the unsplit account transactions as CSV or OFX.');
    result.push({ sourceId: String(result.length), date: field('D').replace(/'/g, '/'), description: [field('P'), field('M')].filter(Boolean).join(' '), amount: field('T'), reference: field('N'), direction: field('T').startsWith('-') ? 'debit' : 'credit', confidence: 9600 });
  }
  if (!result.length) throw new ImportFailure('The QIF file opened.', 'No transactions were found.', text.slice(0, 160), 'Choose a QIF bank or credit-card export.');
  return result;
}

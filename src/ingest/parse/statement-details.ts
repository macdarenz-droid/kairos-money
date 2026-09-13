export type StatementDetails = { start: string; end: string; opening: string; closing: string };
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function namedDate(day: string, month: string, year: string): string | null {
  const index = months.indexOf(month.toLowerCase());
  if (index < 0) return null;
  const date = `${year}-${String(index + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
export function statementDetails(text: string): StatementDetails | null {
  if (!/Westpac\s+Choice/i.test(text)) return null;
  const period = /Statement\s+Period\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*[-–]\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})/i.exec(text);
  if (!period) return null;
  const start = namedDate(period[1]!, period[2]!, period[3]!), end = namedDate(period[4]!, period[5]!, period[6]!);
  const opening = /Opening\s+Balance\s*([+-]?)\s*\$\s*([\d,]+\.\d{2})/i.exec(text), closing = /Closing\s+Balance\s*([+-]?)\s*\$\s*([\d,]+\.\d{2})/i.exec(text);
  if (!start || !end || start > end || !opening || !closing) return null;
  return { start, end, opening: (opening[1] === '-' ? '-' : '') + opening[2]!.replaceAll(',', ''), closing: (closing[1] === '-' ? '-' : '') + closing[2]!.replaceAll(',', '') };
}

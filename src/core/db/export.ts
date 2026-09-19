import { strToU8, zipSync } from 'fflate';
import type { Repository } from './repository';
import type { SqlValue } from './driver';
export function csvCell(value: SqlValue | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function csv(rows: Record<string, SqlValue>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0] ?? {});
  return [keys.map(csvCell).join(','), ...rows.map(row => keys.map(key => csvCell(row[key])).join(','))].join('\r\n') + '\r\n';
}
export async function exportArchive(repo: Repository): Promise<Uint8Array> {
  const all = await repo.exportAll();
  const files: Record<string, Uint8Array> = { 'kairos-money.json': strToU8(JSON.stringify(all, null, 2)), 'README.txt': strToU8('User-requested unencrypted export. JSON preserves exact integer minor units. Each table also has a CSV. Empty CSVs mean zero records. Keep this archive somewhere private. Copies saved outside Kairos must be deleted separately.') };
  for (const [name, rows] of Object.entries(all.tables)) files[`${name}.csv`] = strToU8(csv(rows));
  return zipSync(files);
}
export function base64(data: Uint8Array): string {
  let binary = ''; for (let offset = 0; offset < data.length; offset += 8192) binary += String.fromCharCode(...data.subarray(offset, offset + 8192)); return btoa(binary);
}

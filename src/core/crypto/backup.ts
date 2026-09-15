const header = new TextEncoder().encode('KAIROS-BACKUP-1\n');
export const backupLimit = 64 * 1024 * 1024;
export function normalizeRecoveryCode(code: string): string {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[2-9A-HJ-NP-Z]{40}$/.test(normalized)) throw new Error('Enter the complete 40-character recovery code, including all ten groups.');
  return normalized;
}
async function keyFor(code: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = new TextEncoder().encode(normalizeRecoveryCode(code));
  try {
    const root = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: header }, root, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { material.fill(0); }
}
export async function encryptBackup(snapshot: unknown, code: string): Promise<Uint8Array> {
  const clear = new TextEncoder().encode(JSON.stringify(snapshot));
  try {
    if (clear.length > backupLimit - header.length - 60) throw new Error('This backup exceeds the current 64 MB limit. Your ledger has not changed.');
    const salt = crypto.getRandomValues(new Uint8Array(32)); const iv = crypto.getRandomValues(new Uint8Array(12));
    const prefix = new Uint8Array(header.length + 44); prefix.set(header); prefix.set(salt, header.length); prefix.set(iv, header.length + 32);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: prefix, tagLength: 128 }, await keyFor(code, salt), clear));
    const result = new Uint8Array(prefix.length + encrypted.length); result.set(prefix); result.set(encrypted, prefix.length); return result;
  } finally { clear.fill(0); }
}
export async function decryptBackup(bytes: Uint8Array, code: string): Promise<unknown> {
  normalizeRecoveryCode(code);
  const prefixSize = header.length + 44;
  if (bytes.length > backupLimit || bytes.length < prefixSize + 16 || header.some((value, i) => bytes[i] !== value))
    throw new Error('Choose a Kairos encrypted backup (.kairos), up to 64 MB. JSON/CSV exports cannot be restored here.');
  let clear: Uint8Array | undefined;
  try {
    const salt = new Uint8Array(bytes.slice(header.length, header.length + 32));
    const iv = new Uint8Array(bytes.slice(header.length + 32, prefixSize));
    clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new Uint8Array(bytes.slice(0, prefixSize)), tagLength: 128 }, await keyFor(code, salt), new Uint8Array(bytes.slice(prefixSize))));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear)) as unknown;
  } catch { throw new Error('The recovery code does not match, or this backup is damaged. Nothing was restored.'); }
  finally { clear?.fill(0); }
}

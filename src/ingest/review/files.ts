import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem } from '@capacitor/filesystem';
import type { Repository } from '../../core/db/repository';
import { hash } from '../normalize';
export function decodeFile(data: string): Uint8Array { return Uint8Array.from(atob(data), c => c.charCodeAt(0)); }
export async function selectFiles(repo: Repository): Promise<number> {
  const selection = await FilePicker.pickFiles({ readData: false, limit: 0 });
  if (selection.files.length > 6) throw new Error('Choose up to six files at a time. No files from this selection were staged.');
  if (selection.files.some(f => f.size > 20971520)) throw new Error('One selected file exceeds 20 MB. Choose smaller statements.');
  for (const file of selection.files) {
    if (!file.path) throw new Error('Android did not provide access to the file. Save it locally and choose it again.');
    const loaded = await Filesystem.readFile({ path: file.path });
    if (typeof loaded.data !== 'string') throw new Error('Android did not return readable file data. Choose a locally saved copy.');
    const bytes = decodeFile(loaded.data);
    try { await repo.imports.stageFile(file.name, loaded.data, hash(bytes)); } finally { bytes.fill(0); }
  }
  return selection.files.length;
}

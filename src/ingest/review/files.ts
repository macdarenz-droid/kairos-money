import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem } from '@capacitor/filesystem';
import type { Repository } from '../../core/db/repository';
import { hash } from '../normalize';
export function decodeFile(data: string): Uint8Array { return Uint8Array.from(atob(data), c => c.charCodeAt(0)); }
export async function selectFiles(repo: Repository): Promise<number> {
  const selection = await FilePicker.pickFiles({ readData: false, limit: 0 });
  if (selection.files.length > 6) throw new Error('Choose up to six files at a time. No files from this selection were staged.');
  if (selection.files.some(f => f.size > 20971520)) throw new Error('One selected file exceeds 20 MB. Choose smaller statements.');
  const sessionId = crypto.randomUUID();
  for (const file of selection.files) {
    if (!file.path) throw new Error('Android did not provide access to the file. Save it locally and choose it again.');
    const loaded = await Filesystem.readFile({ path: file.path });
    if (typeof loaded.data !== 'string') throw new Error('Android did not return readable file data. Choose a locally saved copy.');
    const bytes = decodeFile(loaded.data);
    try { await repo.imports.stageFile(file.name, loaded.data, hash(bytes), sessionId); } finally { bytes.fill(0); }
  }
  return selection.files.length;
}
export async function stageDroppedFiles(repo: Repository, files: readonly File[]): Promise<number> {
 if(files.length>6 || files.some(f=>f.size>20971520))throw new Error('Choose up to six files, each below 20 MB.');
 const sessionId=crypto.randomUUID();
 for(const file of files) { const bytes=new Uint8Array(await file.arrayBuffer());try{let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));await repo.imports.stageFile(file.name,btoa(data),hash(bytes),sessionId);}finally{bytes.fill(0);} }
 return files.length;
}

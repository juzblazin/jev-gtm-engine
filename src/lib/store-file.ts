import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

let queue: Promise<unknown> = Promise.resolve();
export async function getFile<T>(key: string): Promise<T | undefined> {
  await queue;
  try { return JSON.parse(await readFile(path.join(process.cwd(), '.data', encodeURIComponent(key) + '.json'), 'utf8')) as T; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
}
export async function putFile(key: string, value: unknown) {
  const work = queue.then(async () => { const dir = path.join(process.cwd(), '.data'); await mkdir(dir, { recursive: true }); const file = path.join(dir, encodeURIComponent(key) + '.json'); await writeFile(file + '.tmp', JSON.stringify(value)); await rename(file + '.tmp', file); });
  queue = work.catch(() => {}); await work;
}

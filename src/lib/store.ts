import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { records } from '@/db/schema';
const dir = path.join(process.cwd(), '.data');
let queue: Promise<unknown> = Promise.resolve();
const db = () => drizzle(neon(process.env.DATABASE_URL!));
export async function get<T>(key: string): Promise<T | undefined> {
  if (process.env.DATABASE_URL) return (await db().select().from(records).where(eq(records.key, key)))[0]?.value as T | undefined;
  await queue;
  try { return JSON.parse(await readFile(path.join(dir, encodeURIComponent(key) + '.json'), 'utf8')) as T; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
}
export async function put(key: string, value: unknown) {
  if (process.env.DATABASE_URL) { await db().insert(records).values({ key, value }).onConflictDoUpdate({ target: records.key, set: { value } }); return; }
  const work = queue.then(async () => { await mkdir(dir, { recursive: true }); const file = path.join(dir, encodeURIComponent(key) + '.json'); await writeFile(file + '.tmp', JSON.stringify(value)); await rename(file + '.tmp', file); });
  queue = work.catch(() => {}); await work;
}
const locks = new Map<string, Promise<unknown>>();
export async function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(fn); locks.set(key, work);
  try { return await work; } finally { if (locks.get(key) === work) locks.delete(key); }
}

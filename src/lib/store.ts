import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { records } from '@/db/schema';
const db = () => drizzle(neon(process.env.DATABASE_URL!));
async function localStore() {
  if (process.env.BOO_RUNTIME === 'cloudflare') throw new Error('DATABASE_URL must be configured as a Worker secret. Local JSON storage is only available in Node.js.');
  return import('./store-file');
}
export async function get<T>(key: string): Promise<T | undefined> {
  if (process.env.DATABASE_URL) return (await db().select().from(records).where(eq(records.key, key)))[0]?.value as T | undefined;
  return (await localStore()).getFile<T>(key);
}
export async function put(key: string, value: unknown) {
  if (process.env.DATABASE_URL) { await db().insert(records).values({ key, value }).onConflictDoUpdate({ target: records.key, set: { value } }); return; }
  await (await localStore()).putFile(key, value);
}
const locks = new Map<string, Promise<unknown>>();
export async function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(fn); locks.set(key, work);
  try { return await work; } finally { if (locks.get(key) === work) locks.delete(key); }
}

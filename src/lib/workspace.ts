import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
export async function workspace() { const jar = await cookies(); let id = jar.get('jev_workspace')?.value; if (!id || !/^[a-f0-9-]{36}$/.test(id)) { id = randomUUID(); jar.set('jev_workspace', id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 31536000, path: '/' }); } return id; }

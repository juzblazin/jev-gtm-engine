import { get } from '@/lib/store';
import { workspace } from '@/lib/workspace';
import type { Run } from '@/lib/types';
export async function GET() { const id = await workspace(); const ids = await get<string[]>('history:' + id) || []; const runs = await Promise.all(ids.map(i => get<Run>('run:' + i))); return Response.json({ runs: runs.filter(Boolean) }); }

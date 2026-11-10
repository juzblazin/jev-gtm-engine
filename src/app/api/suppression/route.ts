import { z } from 'zod';
import { get, put } from '@/lib/store';
import { workspace } from '@/lib/workspace';
export async function GET() { return Response.json({ blocked: await get<string[]>('suppression:' + await workspace()) || [] }); }
export async function POST(req: Request) { const parsed = z.object({ blocked: z.array(z.string().trim().toLowerCase().min(3).max(254)).max(1000) }).safeParse(await req.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Supply a blocked domains/emails array.' }, { status: 400 }); await put('suppression:' + await workspace(), parsed.data.blocked); return Response.json(parsed.data); }

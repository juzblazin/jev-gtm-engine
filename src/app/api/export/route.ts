import { z } from 'zod';
import { get } from '@/lib/store';
import { workspace } from '@/lib/workspace';
import { PLANS } from '@/lib/plans';
import type { Run } from '@/lib/types';
import { fetchPublic } from '@/lib/net';
const schema = z.object({ runId: z.string(), kind: z.enum(['csv', 'webhook', 'attio', 'hubspot']), approved: z.array(z.string()), url: z.string().url().optional() });
export async function POST(req: Request) {
  const p = schema.safeParse(await req.json().catch(() => null)); if (!p.success) return Response.json({ error: 'Invalid export request.' }, { status: 400 });
  const id = await workspace(), run = await get<Run>('run:' + p.data.runId);
  if (!run || run.workspace !== id) return Response.json({ error: 'Run not found.' }, { status: 404 });
  if (run.stage && run.stage !== 'strategy') return Response.json({ error: 'Generate the strategy before exporting sprint cards.' }, { status: 409 });
  const { kind, approved } = p.data, plan = PLANS[run.input.plan];
  if (!(kind === 'csv' ? plan.csv : kind === 'webhook' ? plan.webhook : plan.crm)) return Response.json({ error: 'This export is not included in the run’s plan.' }, { status: 403 });
  const blocked = await get<string[]>('suppression:' + id) || [];
  const isBlocked = (account: string) => blocked.some(b => account.toLowerCase() === b || account.toLowerCase().endsWith('.' + b) || account.toLowerCase().endsWith('@' + b));
  const selected = run.output.sprints.filter(s => approved.includes(s.id));
  const cards = selected.map(s => ({ ...s, targetAccounts: s.targetAccounts.filter(a => !isBlocked(a)) })).filter(s => s.targetAccounts.length);
  if (!selected.length) return Response.json({ error: 'Approve at least one sprint card first.' }, { status: 400 });
  if (kind === 'csv') { const q = (s: unknown) => '"' + String(s).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"'; return new Response(['title,budget,hypothesis,kpi,duration,target_accounts,messaging', ...cards.map(s => [s.title, s.budget, s.hypothesis, s.kpi, s.duration, s.targetAccounts.join(';'), s.messaging].map(q).join(','))].join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="boo-sprints.csv"' } }); }
  if (kind === 'webhook') {
    if (!p.data.url) return Response.json({ error: 'Provide a Slack incoming webhook or Notion automation webhook URL (not a Notion page URL).' }, { status: 400 });
    try { const r = await fetchPublic(p.data.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cards.map(c => `${c.title}: ${c.messaging}`).join('\n'), source: 'Boo GTM', cards }) }); if (!r.ok) throw new Error('Webhook rejected'); return Response.json({ delivered: true, cards: cards.length }); } catch { return Response.json({ error: 'Webhook rejected or destination unavailable. Nothing marked delivered.' }, { status: 502 }); }
  }
  const key = kind === 'attio' ? process.env.ATTIO_API_KEY : process.env.HUBSPOT_ACCESS_TOKEN;
  const payloads = cards.flatMap(s => s.targetAccounts.map(domain => ({ domain, messaging: s.messaging, sprint: s.title })));
  if (!key) return Response.json({ dryRun: true, suppressed: selected.reduce((n, s) => n + s.targetAccounts.length, 0) - payloads.length, provider: kind, payloads });
  const results = [];
  for (const item of payloads) {
    try {
      const attio = kind === 'attio';
      const r = await fetch(attio ? 'https://api.attio.com/v2/objects/companies/records?matching_attribute=domains' : 'https://api.hubapi.com/crm/v3/objects/companies', { method: attio ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(attio ? { data: { values: { domains: [{ domain: item.domain }], description: `${item.sprint}: ${item.messaging}` } } } : { properties: { domain: item.domain, name: item.domain, description: `${item.sprint}: ${item.messaging}` } }), signal: AbortSignal.timeout(10000) });
      results.push({ domain: item.domain, delivered: r.ok, status: r.status });
    } catch { results.push({ domain: item.domain, delivered: false, status: 0 }); }
  }
  return Response.json({ dryRun: false, results, warning: 'HubSpot creates companies; review for existing records before repeating sync.' });
}

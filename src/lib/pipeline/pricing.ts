/* CH-06 pricing & packaging worker: renders /pricing, /changelog and sibling routes via
   treg's routed web.extract, hashes the markdown snapshot for weekly delta detection,
   parses tier mechanics in code, then Jev picks the pricing vulnerability + rebuttal quote. */
import { createHash } from 'crypto';
import { hasTreg, tregPost } from '@/lib/treg';

export type PricingTier = { name: string; monthlyUsd: number | null; annualMonthlyUsd: number | null; allowance: string; gates: string[] };
export type PricingReport = { pricingUrl: string; scrapedAt: string; snapshotHash: string; valueMetric: string; freeMotion: string; annualDiscountPct: number | null; tiers: PricingTier[]; overage: string; changelog: { date: string; title: string }[]; vulnerability?: string; rebuttalQuote?: string; vulnConfidence?: number };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function extract(url: string): Promise<{ markdown: string; hash: string } | null> {
  try {
    const { data } = await tregPost<{ output?: { pages?: { markdown?: string; content_hash?: string }[] } }>('treg.web.extract', { url }, 45000);
    const md = data.output?.pages?.[0]?.markdown;
    if (!md || md.length < 200) return null;
    return { markdown: md, hash: createHash('sha256').update(md).digest('hex') };
  } catch { return null; }
}

const money = (s: string) => { const m = s.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/); return m ? Number(m[1].replace(/,/g, '')) : null; };
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseTiers(md: string): PricingTier[] {
  const lines = md.split('\n'), tiers: PricingTier[] = [];
  let current: PricingTier | null = null;
  for (const line of lines) {
    const head = line.match(/^#{1,3}\s+(.{2,40})/);
    if (head && /free|starter|basic|pro|business|team|enterprise|scale|growth|hobby|premium|plus|solo/i.test(head[1])) { current = { name: head[1].trim().replace(/[*_`]/g, ''), monthlyUsd: null, annualMonthlyUsd: null, allowance: '', gates: [] }; tiers.push(current); }
    const price = money(line);
    if (current && price != null && /mo|month|yr|year|seat|user/i.test(line)) { if (/yr|year|annual/i.test(line)) current.annualMonthlyUsd ??= price; else current.monthlyUsd ??= price; }
    if (current && /sso|saml|scim|audit log|sla|dedicated|custom domain|priority support/i.test(line)) current.gates.push(line.replace(/^[#*\-\s]+/, '').slice(0, 80));
    if (current && /\d[\d,]*\s?(credits|seats|users|members|rows|requests|projects|gb|bandwidth|sites)/i.test(line)) current.allowance ||= line.match(/\d[\d,]*\s?(credits|seats|users|members|rows|requests|projects|gb|bandwidth|sites)/i)?.[0] || '';
  }
  return tiers.slice(0, 6);
}

function classify(md: string): Pick<PricingReport, 'valueMetric' | 'freeMotion' | 'annualDiscountPct' | 'overage'> {
  const low = md.toLowerCase();
  const usage = /credit|usage|per run|per request|bandwidth|compute/i.test(low), seat = /per (user|seat|member)|\/(user|seat)|per user|\/mo per/i.test(low);
  const valueMetric = usage && seat ? 'HYBRID_BASE_PLUS_USAGE' : usage ? 'USAGE_CREDITS' : seat ? 'PER_SEAT' : 'FLAT_TIER';
  const trial = low.match(/(\d+)\s?-?day free trial|free trial|try free|start free/i), freemium = /free (forever|plan|tier)|free for everyone|hobby/i.test(low);
  const freeMotion = trial && !freemium ? `TIME_LIMITED_TRIAL (${trial[1] || '?'}d)` : freemium ? 'FREEMIUM_FOREVER' : /contact sales|book a demo|talk to sales/i.test(low) ? 'SALES_DEMO_ONLY' : 'UNKNOWN';
  const disc = low.match(/(?:save|discount|off)[^\n%]{0,30}(\d{1,2})\s?%|(\d{1,2})\s?%[^\n]{0,30}(?:annual|yearly|year)/i) || low.match(/annual[^\n]{0,40}(\d{1,2})\s?%/i);
  const overage = low.match(/[^\n.]{0,80}(overage|extra (run|credit|seat|request)|additional usage|pay as you go)[^\n.]{0,80}/i)?.[0]?.trim() || '';
  return { valueMetric, freeMotion, annualDiscountPct: disc ? Number(disc[1] || disc[2]) : null, overage };
}

function parseChangelog(md: string): { date: string; title: string }[] {
  const out: { date: string; title: string }[] = [], cutoff = new Date(Date.now() - 90 * 86400000);
  const re = new RegExp(`(${months.join('|')})[a-z]*\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}`, 'gi');
  let m; while ((m = re.exec(md)) && out.length < 12) { const d = new Date(m[0]); if (!isNaN(d.getTime()) && d >= cutoff) out.push({ date: d.toISOString().slice(0, 10), title: md.slice(m.index + m[0].length, m.index + m[0].length + 90).replace(/[\n#*\]]+/g, ' ').trim().slice(0, 80) }); }
  return out;
}

const vulnerabilities = { entry_floor: 'High Entry Price Floor', seat_expansion: 'Punitive Seat Expansion Cost', credit_math: 'Confusing Credit/Overage Math', enterprise_gates: 'Core Features Locked in Enterprise', demo_gate: 'No Self-Serve Trial (Demo Gate)' };

export async function pricingIngest(domain: string): Promise<PricingReport | null> {
  if (!hasTreg()) return null;
  let pricing: { markdown: string; hash: string; url: string } | null = null;
  for (const route of ['/pricing', '/plans', '/billing']) { const hit = await extract(`https://${domain}${route}`); if (hit) { pricing = { ...hit, url: `https://${domain}${route}` }; break; } }
  if (!pricing) return null;
  const tiers = parseTiers(pricing.markdown), mech = classify(pricing.markdown);
  let changelog: { date: string; title: string }[] = [];
  for (const route of ['/changelog', '/whats-new', '/releases']) { const hit = await extract(`https://${domain}${route}`); if (hit) { changelog = parseChangelog(hit.markdown); if (changelog.length) break; } }
  const report: PricingReport = { pricingUrl: pricing.url, scrapedAt: new Date().toISOString(), snapshotHash: pricing.hash, ...mech, tiers, changelog };
  const candidates = pricing.markdown.split('\n').filter(l => /\$|seat|credit|trial|enterprise|contact|gate|sso|overage|fee/i.test(l) && l.trim().length > 25).slice(0, 12);
  if (candidates.length) {
    try {
      const criteria: Record<string, string> = {}; candidates.forEach((c, i) => { criteria[`line_${i}`] = c.trim().slice(0, 300); });
      const { data } = await tregPost<{ answers?: { vulnerability?: { choice?: string; confidence?: number }; rebuttal?: { choice?: string } } }>('openrouter.ai-judge.decide', { model: 'typesafe/jev-1.13', state: `# Pricing page lines\n${candidates.map((c, i) => `<line_${i}>${esc(c.trim().slice(0, 300))}</line_${i}>`).join('\n')}`, questions: { vulnerability: { type: 'choice', instructions: `Given these lines from ${domain}'s pricing page, which is its weakest pricing position a challenger could exploit?`, criteria: vulnerabilities }, rebuttal: { type: 'choice', instructions: 'Which single line is the most concrete, citable evidence of that vulnerability?', criteria } } }, 30000);
      report.vulnerability = vulnerabilities[data.answers?.vulnerability?.choice as keyof typeof vulnerabilities] || undefined;
      report.vulnConfidence = data.answers?.vulnerability?.confidence;
      const pick = data.answers?.rebuttal?.choice?.match(/\d+/); if (pick) report.rebuttalQuote = candidates[Number(pick[0])]?.trim().slice(0, 300);
    } catch { /* vulnerability verdict optional */ }
  }
  return report;
}

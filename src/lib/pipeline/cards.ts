/* Unified evidence cards: every worker's Jev-verified output normalizes into one shape
   (mirrors the gtm_evidence_cards table) so downstream synthesis never parses five schemas.
   confidence >= 0.9 gate: real Jev confidences where verdicts exist; 1.0 for rule-derived
   deterministic signals (flagged jev_verified:false inside quantitative_metric). */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { gtmEvidenceCards } from '@/db/schema';
import { put } from '@/lib/store';
import type { SiteMetrics } from '@/lib/metrics';

export type EvidenceCard = { id: string; taskId: string | null; domain: string; worker: 'CH-02' | 'CH-03' | 'CH-04' | 'CH-05' | 'CH-06'; signal: string; verbatim: string; metrics: Record<string, unknown>; confidence: number; sourceUrl: string; capturedAt: string };

const GATE = 0.9, id = () => crypto.randomUUID();
const card = (domain: string, worker: EvidenceCard['worker'], signal: string, verbatim: string, metrics: Record<string, unknown>, confidence: number, sourceUrl: string): EvidenceCard => ({ id: id(), taskId: null, domain, worker, signal, verbatim, metrics, confidence, sourceUrl, capturedAt: new Date().toISOString() });
const rule = (m: Record<string, unknown>) => ({ ...m, jev_verified: false });

export function toEvidenceCards(domain: string, m: SiteMetrics): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  for (const k of m.seo?.value.keywords || []) {
    if (k.funnelStage && (k.jevConfidence ?? 0) >= GATE) cards.push(card(domain, 'CH-02', k.funnelStage === 'Bottom-of-Funnel Evaluation' ? 'BOF_Switching_Intent' : 'Funnel_Keyword', k.keyword, { volume: k.volume, cpc_usd: k.cpc, position: k.position, position_diff: k.positionDiff, difficulty: k.difficulty, stage: k.funnelStage }, k.jevConfidence!, k.url || `https://${domain}`));
  }
  for (const p of m.seo?.value.decayingPages || []) cards.push(card(domain, 'CH-02', 'Content_Decay', p.url, rule({ etv: p.etv, keywords_down: p.isDown, keywords_lost: p.isLost, top_positions: p.topPositions }), 1, p.url));
  for (const r of m.reviews?.value.reviews || []) {
    if ((r.confidence ?? 0) < GATE || !r.evidence) continue;
    const buyer = r.persona?.includes('Economic') ? 'Economic_Buyer_Friction' : 'Operator_Friction';
    cards.push(card(domain, 'CH-03', buyer, r.evidence, { rating: r.rating, churn_severity: r.churn, friction: r.category, persona: r.persona, source: r.source }, r.confidence!, r.url));
  }
  for (const a of m.adIntel?.value.ads || []) {
    if (a.daysActive >= 60) cards.push(card(domain, 'CH-04', 'Control_Ad_Winner', a.headline || a.body || a.advertiser, rule({ days_active: a.daysActive, platform: a.platform, format: a.format, advertiser: a.advertiser, hook_angle: a.hookAngle, funnel_stage: a.funnelStage }), a.jevConfidence ?? 1, a.libraryUrl || a.landingUrl || `https://${domain}`));
    else if (a.hookAngle && (a.jevConfidence ?? 0) >= GATE) cards.push(card(domain, 'CH-04', 'Ad_Hook_Angle', a.headline || a.body || a.advertiser, { days_active: a.daysActive, platform: a.platform, hook_angle: a.hookAngle, funnel_stage: a.funnelStage }, a.jevConfidence!, a.libraryUrl || a.landingUrl || `https://${domain}`));
  }
  for (const p of m.creators?.value.posts || []) {
    if ((p.jevConfidence ?? 0) < GATE || !p.relationship) continue;
    cards.push(card(domain, 'CH-05', p.relationship.includes('Paid') ? 'Paid_Creator' : p.relationship.includes('Complaint') ? 'Critical_Creator' : 'Organic_Creator', p.text.slice(0, 300), { platform: p.platform, handle: p.handle, followers: p.followers, tier: p.tier, poachability: p.poachability, engagement_rate: p.engagementRate, sponsored: p.sponsored }, p.jevConfidence!, p.postUrl || `https://${domain}`));
  }
  const pr = m.pricingIntel?.value;
  if (pr?.vulnerability && (pr.vulnConfidence ?? 0) >= GATE) cards.push(card(domain, 'CH-06', 'Pricing_Vulnerability', pr.rebuttalQuote || pr.vulnerability, { vulnerability: pr.vulnerability, value_metric: pr.valueMetric, free_motion: pr.freeMotion, annual_discount_pct: pr.annualDiscountPct, tiers: pr.tiers.length }, pr.vulnConfidence!, pr.pricingUrl));
  return cards;
}

export async function persistCards(domain: string, cards: EvidenceCard[]) {
  if (!cards.length) return;
  if (process.env.DATABASE_URL) {
    const db = drizzle(neon(process.env.DATABASE_URL));
    await db.insert(gtmEvidenceCards).values(cards.map(c => ({ taskId: c.taskId, competitorDomain: c.domain, channelWorker: c.worker, signalCategory: c.signal, verbatimEvidence: c.verbatim, quantitativeMetric: c.metrics, jevConfidenceScore: String(c.confidence), sourceUrl: c.sourceUrl })));
    return;
  }
  await put('cards:' + domain, cards);
}

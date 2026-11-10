import { PLANS } from '@/lib/plans';
import { synthesisSchema, type Evidence, type Input, type Synthesis, type Snapshot } from '@/lib/types';
import { domainOf } from './ingest';
export function template(input: Input, evidence: Evidence[]): Synthesis {
  const plan = PLANS[input.plan], domains = input.competitors.map(domainOf), finance = evidence.filter(e => e.category === 'Financial'), ux = evidence.filter(e => e.category === 'UX Friction');
  return {
    summary: `Win on predictable economics and faster time-to-value. Validate ${input.region} demand with a $${input.budget.toLocaleString()} monthly ceiling before scaling. ${evidence.length} retained signals inform these hypotheses; simulated signals are not market facts.`,
    icp: { industry: 'B2B software & technology-enabled services (hypothesis)', size: '20–200 employees', revenue: '$2M–$30M annual revenue (validate)', triggers: ['Reviewing software spend', 'Replacing fragmented workflows', `Expanding in ${input.region}`] },
    matrix: ['Pricing predictability', 'Onboarding & UX', 'Acquisition efficiency', 'Market positioning'].map((dimension, i) => ({ dimension, product: ['Lead with transparent total cost', 'Demonstrate one focused workflow', `Test within $${input.budget}/month`, 'Evidence-led, not superiority claims'][i], competitors: domains.map(domain => ({ domain, finding: evidence.some(e => e.domain === domain) ? 'Signal available — validate in evidence' : 'Insufficient retained evidence' })) })),
    personas: [{ role: 'Economic buyer · CFO', goal: 'Defensible ROI and predictable spend', friction: finance[0]?.quote.slice(0, 160) || 'Cost assumptions need buyer validation.', message: 'A clear business case, transparent costs, measurable payback.' }, { role: 'Daily operator · Growth lead', goal: 'Ship campaigns without operational drag', friction: ux[0]?.quote.slice(0, 160) || 'Workflow assumptions need user validation.', message: 'Less setup. A focused workflow from insight to execution.' }].slice(0, plan.personas),
    messages: [{ headline: 'Know your costs. Own your next move.', body: 'Build a transparent business case before committing to another tool. Compare documented pricing and validate ROI with a small pilot.', evidenceIds: finance.slice(0, 2).map(e => e.id) }, ...(input.plan === 'FREE_TRIAL' ? [] : [{ headline: 'From onboarding to your first outcome.', body: 'Explore a focused workflow built around your team. Validate time-to-value in a guided pilot, without unsubstantiated competitor claims.', evidenceIds: ux.slice(0, 2).map(e => e.id) }])],
    channels: [{ name: 'High-intent search', intent: 92, saturation: 72, gapIndex: 0, playbook: 'Test exact-match problem keywords with a transparent comparison landing page.' }, { name: 'Partner communities', intent: 78, saturation: 24, gapIndex: 0, playbook: 'Share an educational workflow teardown; invite opt-in pilot feedback.' }, { name: 'LinkedIn', intent: 65, saturation: 68, gapIndex: 0, playbook: 'Target finance and growth roles with separate ROI and UX creative.' }].map(c => ({ ...c, gapIndex: Math.round(c.intent * (1 - c.saturation / 100)) })).sort((a, b) => b.gapIndex - a.gapIndex),
    sprints: Array.from({ length: plan.sprints }, (_, i) => ({ id: `sprint-${i + 1}`, title: ['Validate the ROI narrative', 'Test a faster first outcome', 'Find the underserved channel', 'Localize the comparison page', 'Interview the buying committee'][i], budget: Math.floor(input.budget * 0.3 / plan.sprints), hypothesis: `In ${input.region}, a ${i % 2 ? 'focused UX demo' : 'transparent cost narrative'} will generate qualified interest among the ICP.`, kpi: '≥3 qualified conversations; cost per qualified lead below pilot budget / 3', duration: '14 days', targetAccounts: [domainOf(input.product)], messaging: 'Would a short, opt-in workflow and ROI assessment be useful? No competitor claims or guaranteed outcomes.' })),
  };
}
export async function synthesize(input: Input, evidence: Evidence[], snapshots: Snapshot[] = []) {
  const fallback = template(input, evidence);
  if (snapshots.length > 1) {
    const own = snapshots[0], competitor = snapshots[1];
    fallback.summary = `${own.domain} has ${own.visits.toLocaleString('en-US')} monthly visits vs ${competitor.domain} at ${competitor.visits.toLocaleString('en-US')}. ${fallback.summary}`;
    const keyword = competitor.metrics?.topKeywords.value[2];
    if (keyword) fallback.sprints[0].hypothesis = `A comparison landing page targeting “${keyword}” will convert high-intent visitors in ${input.region} into at least 3 qualified conversations. Validate modeled keyword demand before spending.`;
  }
  const prompt = `Return ONLY a JSON object matching this exact shape and array counts: ${JSON.stringify(fallback)}. Use the following evidence and structured comparison metrics to replace hypotheses where supported. Never present simulated evidence as fact. Respect budget ${input.budget}, region ${input.region}. Evidence: ${JSON.stringify(evidence)}. Comparison data: ${JSON.stringify(snapshots.map(s => ({ domain: s.domain, metrics: s.metrics })))}.`;
  try {
    let content = '', provider = '';
    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514', max_tokens: 6500, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error('Anthropic failed'); const d = await r.json(); content = d.content?.find((c: { type: string }) => c.type === 'text')?.text; provider = 'Anthropic';
    } else if (process.env.GEMINI_API_KEY) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }), signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error('Gemini failed'); const d = await r.json(); content = d.candidates?.[0]?.content?.parts?.[0]?.text; provider = 'Gemini';
    } else return { output: fallback, provider: 'deterministic evidence template' };
    const output = synthesisSchema.parse(JSON.parse(content.replace(/^```json\s*|```$/g, '').trim()));
    const p = PLANS[input.plan];
    if (output.personas.length !== p.personas || output.sprints.length !== p.sprints || output.matrix.some(r => r.competitors.length !== input.competitors.length) || output.sprints.reduce((n, s) => n + s.budget, 0) > input.budget) throw new Error('Invalid entitlement or budget output');
    return { output, provider };
  } catch { return { output: fallback, provider: 'deterministic template (provider unavailable or invalid output)' }; }
}

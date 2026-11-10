import type { Compliance } from '@/lib/types';
export function scoreCompliance(text: string, region: string): Compliance {
  const insults = /scam|garbage|terrible|dishonest|inferior|worst/i.test(text), absolute = /best|guarantee|always|never|cheaper|better than/i.test(text);
  const strict = region !== 'US', score = Math.min(100, (insults ? strict ? 90 : 70 : 0) + (absolute ? 35 : 0));
  return { region, score, risk: score >= 70 ? 'high' : score >= 30 ? 'review' : 'low', rationale: strict ? 'EU/UK comparative advertising: substantiate objective comparisons and avoid denigration (Directive 2006/114/EC; UK implementing rules). Human legal review required.' : 'US FTC: truthful, substantiated comparisons; nominative references must not imply endorsement. Human legal review required.', rewrite: score ? 'Explore transparent pricing and a focused onboarding workflow. Compare documented features to choose the fit for your team.' : text };
}

import type { Run } from './types';

export function strategyBackLink(run: Run) {
  return run.story ? { href: `/run/${run.id}?step=analysis`, label: 'Back to the story' } : { href: `/run/${run.id}?step=compare`, label: 'Back to comparison' };
}

export function runStep(run: Run | null, requested?: string | null): 'compare' | 'analysis' | 'strategy' {
  const saved = run?.stage || (run?.providers.synthesis || run?.timings.synthesis !== undefined || run?.timings.strategy !== undefined || run?.compliance.length ? 'strategy' : run?.story ? 'analysis' : run?.output.sprints.length ? 'strategy' : 'comparison');
  if (requested === 'compare') return 'compare';
  if (requested === 'analysis' && run?.story) return 'analysis';
  return saved === 'comparison' ? 'compare' : saved;
}

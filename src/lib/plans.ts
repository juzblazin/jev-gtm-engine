export const PLANS = {
  FREE_TRIAL: { label: 'Free Trial', max_competitors: 1, triage: 'top10', matrixWidth: 1, personas: 1, sprints: 1, regional: false, csv: false, webhook: false, crm: false },
  PREMIUM: { label: 'Premium', max_competitors: 3, triage: 'full', matrixWidth: 3, personas: 2, sprints: 3, regional: false, csv: true, webhook: true, crm: false },
  SCALE: { label: 'Scale', max_competitors: 5, triage: 'velocity', matrixWidth: 5, personas: 2, sprints: 5, regional: true, csv: true, webhook: true, crm: true },
} as const;
export type Plan = keyof typeof PLANS;
export class GateError extends Error { status = 403; }
export function enforcePlan(plan: Plan, competitors: number, used: boolean) {
  if (competitors > PLANS[plan].max_competitors) throw new GateError(`${PLANS[plan].label} allows at most ${PLANS[plan].max_competitors} competitor(s). Choose a higher plan.`);
  if (plan === 'FREE_TRIAL' && used) throw new GateError('This workspace has used its one free trial. Select Premium or Scale to continue.');
}

'use client';
import { useEffect, useState } from 'react';
import Ghost from './ghost';
import { SiteHeader } from './arc/blocks/site-header/site-header';
import { ThemeSwitch } from './arc/theme-switch/theme-switch';
import { Dialog, DialogContent, DialogTrigger } from './arc/dialog/dialog';
import { Button, RadioGroup } from './ui';
import { PLANS, type Plan } from '@/lib/plans';
export default function AppHeader({ plan, onPlanChange }: { plan?: Plan; onPlanChange?: (p: Plan) => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => { if (localStorage.getItem('jev_theme') === 'dark') { setTheme('dark'); document.documentElement.dataset.theme = 'dark'; } }, []);
  return <div className="app-header"><SiteHeader brand={{ name: 'Boo', href: '/', mark: <Ghost size={32}/> }} items={[{ value: 'home', label: 'Intelligence', href: '/' }, { value: 'history', label: 'Workspace', href: '/workspace' }]} primaryAction={null} secondaryAction={null} sticky={false}/><div className="header-controls">{plan && onPlanChange && <Dialog><DialogTrigger asChild><Button variant="ghost">{PLANS[plan].label} plan</Button></DialogTrigger><DialogContent title="Choose a plan" description="Demo entitlements only. No payment is required."><RadioGroup label="Plan" value={plan} onValueChange={p => onPlanChange(p as Plan)} options={Object.entries(PLANS).map(([value, p]) => ({ value, label: p.label === 'Free Trial' ? 'Free trial' : p.label, description: `Up to ${p.max_competitors} competitors. ${p.sprints} validation sprints.` }))}/></DialogContent></Dialog>}<ThemeSwitch theme={theme} onThemeChange={next => { setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem('jev_theme', next); }}/></div></div>;
}

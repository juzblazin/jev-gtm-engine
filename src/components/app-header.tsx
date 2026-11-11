'use client';
import { useEffect, useState } from 'react';
import Ghost from './ghost';
import { SiteHeader } from './arc/blocks/site-header/site-header';
import { ThemeSwitch } from './arc/theme-switch/theme-switch';
import type { Plan } from '@/lib/plans';
export default function AppHeader(_props: { plan?: Plan; onPlanChange?: (p: Plan) => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => { if (localStorage.getItem('jev_theme') === 'dark') { setTheme('dark'); document.documentElement.dataset.theme = 'dark'; } }, []);
  const toggle = <ThemeSwitch iconOnly theme={theme} onThemeChange={next => { setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem('jev_theme', next); }}/>;
  return <div className="app-header"><SiteHeader brand={{ name: 'Boo', href: '/', mark: <Ghost size={32}/> }} items={[{ value: 'home', label: 'Intelligence', href: '/' }, { value: 'history', label: 'Workspace', href: '/workspace' }]} primaryAction={null} secondaryAction={null} menuExtras={toggle} sticky={false}/></div>;
}

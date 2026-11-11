import type { Metadata } from 'next';
import { Alert } from '@/components/ui';
import PlaybooksBrowser from '@/components/playbooks-browser';
import AppHeader from '@/components/app-header';

export const metadata: Metadata = { title: 'Growth playbooks | Boo', description: 'Named go-to-market motions from SaaS, BaaS, e-commerce, marketplaces and more. Pick a play and analyse the space.' };

export default function PlaybooksPage() {
  return <>
    <AppHeader/>
    <main className="page playbook-page">
      <div className="page-heading"><h1>Growth playbooks</h1><p className="muted">The motions behind companies that broke out, grouped by business model. Pick a play, then run it through the engine against your own market.</p></div>
      <Alert tone="info" title="Illustrative archetypes">Each play is an original writeup of a known growth motion with a public exemplar domain, not a verified case study of that company.</Alert>
      <PlaybooksBrowser/>
    </main>
  </>;
}

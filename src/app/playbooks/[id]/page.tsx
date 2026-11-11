import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import AppHeader from '@/components/app-header';
import SiteShot from '@/components/site-shot';
import { playbooks, playbooksByCategory } from '@/lib/playbooks';

export const dynamicParams = false;
export function generateStaticParams() { return playbooks.map(p => ({ id: p.id })); }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = playbooks.find(x => x.id === id);
  if (!p) return {};
  const title = `${p.title}: ${p.category} growth playbook | Boo`;
  return { title, description: p.summary, alternates: { canonical: `/playbooks/${p.id}` }, openGraph: { title, description: p.summary, type: 'article' } };
}

export default async function PlaybookDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = playbooks.find(x => x.id === id);
  if (!p) notFound();
  const related = playbooksByCategory(p.category).filter(x => x.id !== p.id).slice(0, 3);
  const jsonLd = { '@context': 'https://schema.org', '@type': 'HowTo', name: p.title, description: p.summary, step: p.moves.map((m, i) => ({ '@type': 'HowToStep', position: i + 1, text: m })) };
  return <>
    <AppHeader/>
    <main className="page playbook-detail">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}/>
      <Link href="/playbooks" className="back-link"><ChevronLeft size={13}/> All playbooks</Link>
      <div className="page-heading"><h1>{p.title}</h1><Badge>{p.category}</Badge></div>
      <div className="playbook-hero">
        <SiteShot domain={p.exampleDomain} width={1600} height={900} alt={`${p.exampleDomain} landing page`} className="playbook-hero-shot" localSrc={`/playbooks/${p.id}.webp`}/>
        <div className="playbook-exemplar">
          <img src={`https://www.google.com/s2/favicons?domain=${p.exampleDomain}&sz=128`} alt="" className="playbook-logo"/>
          <div><b>Exemplar: {p.exampleDomain}</b><p className="muted">A public site that embodies this motion. Analyse it below.</p></div>
        </div>
      </div>
      <section className="playbook-section"><h2>How it works</h2><p>{p.body}</p></section>
      <section className="playbook-section"><h2>The moves</h2><ol className="playbook-steps">{p.moves.map(m => <li key={m}>{m}</li>)}</ol></section>
      <section className="playbook-section"><h2>Where it plays out</h2><div className="chip-row">{p.channels.map(c => <Badge key={c}>{c}</Badge>)}</div></section>
      <section className="playbook-section"><h2>The outcome</h2><p>{p.outcome}</p></section>
      <div className="flow-action"><div><h3>Run this play on your market</h3><p className="hint">Boo gathers live signals on {p.exampleDomain} and its competitors, then writes the GTM strategy.</p></div><Link href={`/analyze?domain=${encodeURIComponent(p.exampleDomain)}`}><Button variant="primary">Analyse this play <ArrowRight size={16}/></Button></Link></div>
      {related.length ? <section className="playbook-section"><h2>More {p.category} plays</h2><div className="playbook-grid">{related.map(r => <Card key={r.id} title={r.title} description={r.summary} meta={<Badge>{r.category}</Badge>} status={`Exemplar: ${r.exampleDomain}`} action={<Link href={`/playbooks/${r.id}`}><Button variant="secondary">Open play <ArrowRight size={14}/></Button></Link>}/>)}</div></section> : null}
    </main>
  </>;
}

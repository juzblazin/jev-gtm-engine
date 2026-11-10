import type { Metadata } from 'next';
import './globals.css';
import './guided.css';
export const metadata: Metadata = { title: 'Jev — Your next unfair advantage', description: 'Evidence-led competitive intelligence and GTM execution.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

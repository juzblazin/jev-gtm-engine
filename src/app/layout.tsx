import type { Metadata } from 'next';
import '@fontsource-variable/figtree';
import '@/components/arc/foundation.css';
import './globals.css';
export const metadata: Metadata = { title: 'Boo | Competitive clarity', description: 'Evidence-led competitive intelligence and GTM execution.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

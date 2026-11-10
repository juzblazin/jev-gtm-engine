import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@/components/arc/foundation.css';
import './globals.css';
export const metadata: Metadata = { title: 'Jev | Competitive clarity', description: 'Evidence-led competitive intelligence and GTM execution.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

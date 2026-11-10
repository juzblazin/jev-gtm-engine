import { Suspense } from 'react';
import Guided from '@/components/guided';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Suspense><Guided mode="run" id={id}/></Suspense>; }

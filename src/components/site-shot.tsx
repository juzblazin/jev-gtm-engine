'use client';
import { useState } from 'react';

/* Landing-page screenshot with provider fallbacks: a locally baked image first
   (fast, can't break), then microlink, then thum.io, then a logo placeholder so
   a failed render never shows a broken image. */
export default function SiteShot({ domain, width, height, alt, className, localSrc }: { domain: string; width: number; height: number; alt: string; className?: string; localSrc?: string }) {
  const sources = [
    ...(localSrc ? [localSrc] : []),
    `https://api.microlink.io/?url=${encodeURIComponent(`https://${domain}`)}&screenshot&embed=screenshot.url&meta=false&viewport.width=${width}&viewport.height=${height}`,
    `https://image.thum.io/get/width/${Math.round(width / 2)}/crop/${Math.round(height / 2)}/https://${domain}`,
  ];
  const [i, setI] = useState(0);
  if (i >= sources.length) {
    return <div className={`${className || ''} site-shot-fallback`} role="img" aria-label={alt}><img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`} alt="" width={48} height={48}/><span>{domain}</span></div>;
  }
  return <img src={sources[i]} alt={alt} loading="lazy" className={className} onError={() => setI(x => x + 1)}/>;
}

/* One-shot (re-runnable) fetcher: grabs a landing-page screenshot for every
   playbook exemplar, normalizes it with sharp, and writes public/playbooks/<id>.webp
   so the site serves local files instead of live screenshot services. */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const outDir = path.join(root, 'public', 'playbooks');
mkdirSync(outDir, { recursive: true });

const src = readFileSync(path.join(root, 'src/lib/playbooks.ts'), 'utf8');
const entries = [...src.matchAll(/id:\s*'([^']+)'[\s\S]*?exampleDomain:\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], domain: m[2] }));

const providers = [
  (d) => `https://api.microlink.io?url=${encodeURIComponent('https://' + d)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1440&viewport.height=900&waitForTimeout=3000`,
  (d) => `https://s0.wp.com/mshots/v1/${encodeURIComponent('https://' + d)}?w=1440&h=900`,
  (d) => `https://image.thum.io/get/width/1440/crop/900/https://${d}`,
];

async function grab(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'Mozilla/5.0 playbook-thumb' } });
      if (!r.ok) continue;
      const type = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (!type.startsWith('image/') || buf.length < 8000) continue; // placeholders/errors are tiny or non-image
      return buf;
    } catch { /* next try */ }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

let ok = 0, fail = 0;
for (const { id, domain } of entries) {
  const out = path.join(outDir, `${id}.webp`);
  let buf = null, via = '';
  for (let p = 0; p < providers.length && !buf; p++) {
    buf = await grab(providers[p](domain));
    if (buf) via = ['microlink', 'mshots', 'thum.io'][p];
  }
  if (!buf) { fail++; console.log(`FAIL ${id.padEnd(22)} ${domain}`); continue; }
  const webp = await sharp(buf).resize(1440, 900, { fit: 'cover', position: 'top' }).webp({ quality: 80 }).toBuffer();
  writeFileSync(out, webp);
  ok++;
  console.log(`ok   ${id.padEnd(22)} ${domain.padEnd(20)} ${via} -> ${(webp.length / 1024).toFixed(0)}kb`);
}
console.log(`\n${ok} saved, ${fail} failed -> public/playbooks/`);

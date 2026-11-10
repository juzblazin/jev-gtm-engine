import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
const config: NextConfig = { experimental: { cpus: 2 } };
export default config;
initOpenNextCloudflareForDev();

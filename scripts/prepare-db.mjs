import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('Export DATABASE_URL before preparing the Neon database.');
await neon(process.env.DATABASE_URL)`CREATE EXTENSION IF NOT EXISTS vector`;
console.log('pgvector extension is ready. Run npm run db:push to create the tables.');

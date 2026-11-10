import { pgTable, text, jsonb, vector } from 'drizzle-orm/pg-core';
export const records = pgTable('jev_records', { key: text('key').primaryKey(), value: jsonb('value').notNull(), embedding: vector('embedding', { dimensions: 1536 }) });

import { pgTable, text, jsonb, vector, uuid, varchar, numeric, timestamp } from 'drizzle-orm/pg-core';
export const records = pgTable('jev_records', { key: text('key').primaryKey(), value: jsonb('value').notNull(), embedding: vector('embedding', { dimensions: 1536 }) });
export const gtmEvidenceCards = pgTable('gtm_evidence_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id'),
  competitorDomain: varchar('competitor_domain', { length: 255 }).notNull(),
  channelWorker: varchar('channel_worker', { length: 20 }).notNull(),
  signalCategory: varchar('signal_category', { length: 100 }).notNull(),
  verbatimEvidence: text('verbatim_evidence').notNull(),
  quantitativeMetric: jsonb('quantitative_metric').notNull(),
  jevConfidenceScore: numeric('jev_confidence_score', { precision: 4, scale: 3 }).notNull(),
  sourceUrl: text('source_url').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  embedding: vector('embedding', { dimensions: 1536 }),
});

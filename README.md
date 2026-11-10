# Jev · Signal into strategy

A local-first competitive intelligence and GTM execution dashboard. **No API keys, database, or billing setup required.** Mock observations are explicitly labeled simulated. Real public pricing/homepage fetches are labeled live. Strategy is a hypothesis, not verified market research or legal advice.

## First-time setup (macOS)

1. Install Homebrew from https://brew.sh (follow the instructions on that site in Terminal).
2. In Terminal, install Node: `brew install node` (Node 20.19+ recommended).
3. Open this project folder in Terminal: `cd /path/to/jev-gtm-engine`.
4. Install dependencies: `npm install`.
5. Copy the settings template: `cp .env.example .env.local`. Leave every key blank to start.
6. Start the app: `npm run dev`.
7. Open **http://localhost:3000**. Enter your product and competitors, choose a plan, budget and region, then Generate playbook. Leave Terminal open. Press Ctrl+C to stop.

On Linux/Windows install Node from https://nodejs.org and follow steps 3–7 (Windows can copy the file in Explorer). Production: `npm run build && npm start`. Plan switching is a demo entitlement selector, not billing. Free Trial allows one attempt per anonymous cookie workspace; clearing cookies creates a new anonymous identity. Do not use this as a paid authentication boundary.

## Using the playbook

Six tabs cover matrix, firmographics/personas, messages with legal risk screens, modeled channel opportunities, approval-based sprint cards and sourced evidence. History reopens prior runs for this browser workspace. Clipboard works for all tiers; Premium adds CSV and Slack/Notion automation webhook POSTs; Scale adds regional variants and Attio/HubSpot REST. Approve cards in Sprint Cards before exporting. A Notion page URL is not a webhook: use a Notion automation or integration receiver that accepts JSON. CRM keys absent = dry-run preview. HubSpot creates companies and can duplicate repeated syncs; review before re-sending. Account suggestions are hypotheses (the product domain in the deterministic demo), not discovered leads. Suppression ledger entries block matching domains, subdomains or exact emails before export/sync.

## Architecture

- Next.js 15 App Router, TypeScript, Tailwind, zod; client reads SSE from `POST /api/analyze`.
- `src/lib/plans.ts`: exact 1/3/5 competitor limits, 1/2/2 personas, 1/3/5 sprints, export gates. Server rejects over-limit requests with 403 **before any provider call**. Free attempts are reserved before streaming to prevent concurrent duplicate trials.
- Layer 1: domain-keyed snapshots less than 7 days old, six parallel channels per domain. Public pricing then homepage fetch has timeouts and no redirects. Reviews, ads, social, news are simulated. Similarweb uses last available month; low traffic routes to configured Apify actor or 1Lookup adapter, otherwise deterministic traffic estimate.
- Layer 1.5: `TriageClient` abstraction, verbatim quote validation, ≥0.90 threshold, top 10% of qualifying cards for Free; full categories for Premium/Scale. Heuristic scores are fixed rule-based confidence estimates, **not statistically calibrated probabilities**. Scale exposes trend velocity, currently 0 until a historical comparison source exists.
- Layer 2: Anthropic preferred, otherwise Gemini, JSON parsed and zod validated plus entitlement/budget checks. Invalid/error output falls back to deterministic evidence templates. Without keys all synthesis is deterministic. Channel indices are modeled estimates, not live ad measurements.
- Layer 3: deterministic lexical denigration/absolute-claim risk screening for US vs EU/UK; Scale produces all three regional variants. This is not legal clearance.
- Storage: `.data/` atomic JSON files by default. Optional Neon via Drizzle stores JSONB records and nullable pgvector embeddings. Embedding generation/similarity search is not implemented; cache uses exact domain keys (avoids semantic cross-domain contamination). SSE carries layer timing plus final run. `/api/history`, `/api/export`, `/api/suppression` are workspace scoped.

### Optional Neon

Set `DATABASE_URL` in `.env.local`. In the Neon SQL editor run `CREATE EXTENSION IF NOT EXISTS vector;`, then run `set -a; source .env.local; set +a; npm run db:push` in bash. Drizzle creates `jev_records`. Restart the dev server. Existing local history is not migrated. Configured database errors are surfaced, not silently redirected to local disk. Local file mode is intended for one long-running Node process; process-local trial locks do not provide multi-instance transactional guarantees. Add database transactions/auth/rate limits before production multi-instance use.

### Jev API verification & adapters

No public Jev API contract could be verified: `https://www.jev.ai` returned a domain brokerage page and `https://huggingface.co/typesafe/jev-1.13.0` returned HTTP 401 during implementation. We do not claim either is an official inference endpoint. Set **both** `JEV_API_KEY` and `JEV_API_URL` only to a trusted adapter you control. Contract: authenticated Bearer POST `{snippets, categories, instructions}` returns array `{id,category:"Financial"|"UX Friction"|"Other",severity:1..5,confidence:0..1,quote:string}`. Quotes must be substrings of original snippets. Otherwise local triage remains active. 1Lookup likewise needs a configurable adapter; no assumed vendor API. Apify needs a traffic-capable actor (`APIFY_ACTOR_ID`) in addition to the token, because no universal traffic actor contract exists.

Every supported key is documented in `.env.example`. Anthropic/Gemini and CRM endpoints use official REST URL patterns but were not tested with real credentials. Never commit `.env.local`. Restart after changing env. External requests can fail from anti-bot protections; the UI continues using explicitly labeled simulated observations. User-entered fetch/webhook URLs reject private hosts/IP literals and redirects; deploy behind network egress controls for robust DNS-rebinding protection. Anonymous cookies are not production auth. Do not expose this demo publicly with provider credentials without access controls.

## Checks & API

`npm run lint && npx tsc --noEmit && npx vitest run && npm run build`

```bash
curl -N -c cookies.txt -H 'Content-Type: application/json' http://localhost:3000/api/analyze \
  -d '{"product":"https://linear.app","competitors":["https://asana.com"],"budget":3000,"region":"US","plan":"FREE_TRIAL"}'
```

SSE `data:` objects have `type: progress | result | error`. HTTP input errors are 400; entitlement failures 403. Use `-b cookies.txt` to reuse a workspace. Local history and suppression data live in `.data/` (gitignored); back it up if important. Export POST accepts `{runId,kind:"csv"|"webhook"|"attio"|"hubspot",approved:[sprintId],url?:webhookUrl}`. Webhooks receive `{text,source,cards}`; no sends happen until requested.

#!/usr/bin/env bash
set -euo pipefail
node scripts/check-staging.mjs
npm run worker:types
npm run typecheck
npm test
npx wrangler deploy --config worker/wrangler.jsonc --dry-run
npx wrangler d1 migrations apply deplyze-space-staging --config worker/wrangler.jsonc --remote
npx wrangler deploy --config worker/wrangler.jsonc

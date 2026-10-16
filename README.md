# Deplyze Space

Live frontend: https://www.deplyze.space (https://deplyze.space redirects here). Existing Next.js UI, Cloudflare Worker, private R2 storage and D1 metadata. Resource names still contain `staging`; these are the same resources now serving the public domains. Do not create duplicates. See [verification and limitations](docs/READINESS.md).

## Checks

Node 24 and npm: `npm ci`, `npm run worker:types`, `npm run typecheck`, `npm test`, `npm run build`. Install Playwright Chromium with `npx playwright install chromium`, then run `npm run test:e2e` for the disposable local D1/R2/S3 application.

`npm run test:staging:origins` checks deployed Worker and R2 preflights, including both public domains and rejection of an unrelated origin. `npm run test:hosted` uploads real files to the live application from desktop and mobile Chromium, verifies QR/copy/download, exercises retry and reload recovery, and compares SHA-256 in a separate browser context. These tests consume real quotas; do not put them in a recurring production loop. Override `HOSTED_BASE_URL` and `HOSTED_SHARE_ORIGIN` for a different verified environment. Screenshots and sanitized request-status reports go to ignored `.artifacts/`; traces are disabled because signed URLs contain bearer credentials.

## Existing infrastructure

- Cloudflare account: `b6683d42632a146d7b07fad1a528a8cb` (Guidenow7).
- Worker: `deplyze-space-staging`; API: https://deplyze-space-staging.deplyze-space-b6683d42.workers.dev.
- Private R2 bucket: `deplyze-space-staging`. Public bucket domains remain disabled.
- D1: `deplyze-space-staging`, ID `a372c702-cb31-429d-ad69-a6c4d142f534`; migration `0001_transfers.sql` is applied.
- Vercel project: `prj_Sl8WgKVXOjMJapGIsB6TmwNzUhjy`, team `team_5sOdHI6Lp35U60vlevwPPTid` (NextQ).

`NEXT_PUBLIC_API_URL` must be the Worker origin, without a trailing slash, in both Vercel deployment environments. Worker `ALLOWED_ORIGINS` and the R2 PUT policy must include every supported exact frontend origin, including both `https://deplyze.space` and `https://www.deplyze.space`. Never allow arbitrary Vercel origins. `SHARE_ORIGIN=https://www.deplyze.space`. `node scripts/check-staging.mjs` checks the existing resource identity, policy parity and password-service URL before deployment. Its historical filename does not imply a disposable environment.

The R2 policy allows PUT with Content-MD5 and exposes ETag. Lifecycle rules abort incomplete uploads after 24 hours and remove leftovers after 31 days. The cleanup Cron runs every 15 minutes. Keep `R2_ENDPOINT` empty outside disposable local tests. Keep `UPLOADS_ENABLED=true` only while admissions are intended.

Worker encrypted secrets: `SIGNING_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PASSWORD_KDF_SECRET`. The last secret must match the sensitive, server-only Vercel environment variable. Never use a NEXT_PUBLIC prefix for a secret, print a value, or commit environment files.

## Password derivation

Hosted Workers reject native PBKDF2 at the configured 600,000 iterations; a JavaScript fallback also exceeded hosted CPU limits. Cloudflare delegates only derivation to the existing authenticated Next.js Node endpoint `/api/internal/password`, using `PASSWORD_KDF_URL=https://www.deplyze.space/api/internal/password`. The endpoint rejects unauthenticated/browser calls before computing, bounds input size, and uses asynchronous native PBKDF2-SHA256 with 600,000 iterations. This preserves existing hashes and avoids weakening the work factor or buying new infrastructure. The Worker retains all transfer authorization, password checking and storage control. Redirects are refused; passwords and credentials are not logged.

## Limits and operations

Limits: 2 GiB per transfer, 50 files, 4 GiB and 10 transfers per IP per day, five create attempts per IP per hour, 20 GiB and 200 transfers globally per day, and 40 GiB of declared stored/reserved bytes. D1 quota reservations are atomic. Cancelled admissions still count towards the daily window. Failed validation counts towards the hourly create limit. Storage reservations are released only after successful cleanup.

`GET /health` checks D1 and upload enablement, not S3 credentials or bucket CORS. Expiry prevents new access immediately; Cron then deletes objects and metadata. Existing downloads may finish. Interrupted sessions last 24 hours. Retry verifies file fingerprints and reuses completed files; unfinished parts are uploaded again. Start over cancels a pending session, with Cron as fallback.

Before deploying, run the relevant local checks and dry run. `scripts/deploy-staging.sh` targets the existing active backend and applies additive migrations; use it only as an intentional live deployment. No repository script changes production DNS. Deploy the tested Git commit to the existing Vercel project and verify the real domain resolves to that commit. New immutable preview URLs require explicit CORS registration; use the verified stable branch alias for routine previews.

Pause admissions with `UPLOADS_ENABLED=false` if rollback is needed. Preserve R2, D1, migrations and secrets. The previous frontend `dpl_CSVcbovvSiQvpwfD6izQyzqkyUCP` supports the same password endpoint. Keep current production origin policies when rolling code back; earlier Worker versions lack those origins. Test the real domains before restoring admissions.

Files download individually as attachments. There is no archive endpoint, malware scanning or end-to-end encryption. Distributed abuse still needs monitoring beyond IP quotas. A private abuse contact remains an operator follow-up; the current privacy page links to public GitHub issues and warns against posting sensitive contents.

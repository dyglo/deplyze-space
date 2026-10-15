# Deplyze Space

Existing Next.js design with a Cloudflare Worker, private R2 storage, and D1 metadata. No account required. **Not production released:** the staging Worker and D1 schema are deployed, but hosted transfer verification remains blocked by execution-network policy; see [readiness](docs/READINESS.md).

## Local checks

Node 24, npm. `npm ci`, `npm run worker:types`, `npm run typecheck`, `npm test`, `npm run build`.

`CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` uses the installed Chromium on this workspace. On another machine, install Playwright Chromium and omit `CHROMIUM_PATH`. The suite launches Next.js and Cloudflare's local D1/R2/S3 runtime. Test credentials exist only in that isolated runtime. It transfers actual file bytes without mocked API responses. Desktop and mobile Chromium are configured; Firefox/WebKit and real mobile hardware remain release checks.

## Staging setup

Inspect resources in account `b6683d42632a146d7b07fad1a528a8cb` before creating anything. Reuse resources named `deplyze-space-staging`. Do not reuse `deplyzegpt-storage`. The tracked D1 ID is `a372c702-cb31-429d-ad69-a6c4d142f534`. This database and the named Worker already exist; reuse them. The private bucket now exists, has public access disabled, and has CORS/lifecycle safeguards applied. The cleanup Cron is registered. Both S3 credential bindings now have the correct names and are encrypted. Their S3 access still needs hosted verification. The staging frontend is https://deplyze-space-staging-next-q.vercel.app.

1. Verify Cloudflare connection and account. Required permissions: Workers R2 Storage Write, D1 Write, Workers Scripts Write. A bucket-scoped R2 Object Read & Write credential is also required for S3 multipart control/signing. No credentials belong in the browser or Git.
2. Reuse the existing `deplyze-space-staging` R2 bucket and D1 database. Create them only if inspection confirms they are missing. Record the real D1 ID in `worker/wrangler.jsonc`. Keep R2 `r2.dev` and custom public domains disabled. Inspect existing settings before changes.
3. Set Worker secrets with `wrangler secret put NAME --config worker/wrangler.jsonc`: `SIGNING_SECRET` (random 256+ bits), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Use secure interactive input or secret-manager input; never put values in arguments or logs.
4. Reuse Vercel staging project `prj_Sl8WgKVXOjMJapGIsB6TmwNzUhjy`. Set its `NEXT_PUBLIC_API_URL` to the deployed Worker origin; no trailing slash. Set Worker `ALLOWED_ORIGINS` and `SHARE_ORIGIN` to the exact staging frontend origin. Never allow `*.vercel.app` or reflect arbitrary origins. Hosted share links use that staging origin; production will use `https://deplyze.space` after approval.
5. Adapt and apply `worker/r2-cors.example.json` to the staging bucket. Apply `worker/r2-lifecycle.json` using Cloudflare's bucket API/dashboard after confirming its schema. CORS must expose `ETag`, allow `PUT` and signed MD5 headers, and restrict origins. Lifecycle safeguards abort incomplete uploads at 24 hours and remove leftover objects after 31 days. The staging policy is tracked in `worker/r2-cors.staging.json`; it and the lifecycle rules have been applied remotely.
6. Keep `R2_ENDPOINT` empty outside local tests. Verify private bucket settings and safeguards, then set `UPLOADS_ENABLED` to `true`. Run `bash scripts/deploy-staging.sh`. The script rejects placeholder IDs, localhost origins, and domain routes. It applies additive migrations before deploying.
7. Deploy the staging Git branch to Vercel. Test actual R2 transfers from separate browsers and devices, expiration, cancellation, interruptions, and a 2 GB boundary transfer before release. Verify signed `Content-Length` rejection against hosted R2; local verification is insufficient to certify the remote service. Password hashing uses PBKDF2-SHA256 with 600,000 iterations; provision Workers CPU capacity and measure its hosted cost/latency.

Local manual Worker development: `npm run worker:dev` (uploads disabled until configured). For a complete disposable local application, run `node tests/local-server.mts` and `npm run dev` in separate terminals. The local S3 service is provided by Miniflare; do not expose its test credentials to the Internet.

## Operations and rollback

`GET /health` checks D1 and reports whether uploads are enabled. It does not certify R2 credentials, CORS, or lifecycle configuration. Cron runs every 15 minutes. Access expires immediately in the API; an already running download may finish. Incomplete upload sessions last 24 hours. Cleanup retries records in `deleting` state and deletes metadata only after storage operations succeed. Diagnostics contain event types, error classes, request IDs, and aggregate cleanup counts. Invocation URL logging is disabled to avoid logging bearer download queries.

Current quotas: 2 GiB/transfer, 50 files, 4 GiB and 10 transfers/IP/day, five create attempts/IP/hour, 20 GiB and 200 transfers globally/day, 40 GiB total declared stored/reserved bytes. Quotas reserve atomically in D1 and include abandoned/cancelled transfers for the daily window. Anonymous network quotas are abuse friction; distributed attackers still require monitoring, WAF controls, and possibly Turnstile before broad launch. Limits live in `worker/src/security.ts`, `worker/src/index.ts`, and the SQL quota constraints. Raising SQL limits requires a reviewed migration. Reservations execute inside the same atomic D1 batch as transfer creation, and CHECK constraints roll back over-quota batches.

Pause upload admissions by setting `UPLOADS_ENABLED=false`. Use `wrangler versions list` and `wrangler rollback` against the staging Worker for code rollback. Preserve R2 and D1; do not reverse data migrations or delete storage during rollback. Roll back Vercel to a previously verified deployment in the same staging project. In production, use a staged production build and an explicit approval for domain reassignment. **No script in this repository switches production domains.**

Downloads stream as attachments from the API origin with `application/octet-stream`, `nosniff`, a sandbox policy, and no cache. Passwords and bearer tokens must not appear in analytics or URLs other than the intentionally short-lived download signature. Browser upload-session tokens persist locally for recovery; start over abandons the pending transfer and Cron is the fallback if cancellation fails.

There is no malware scanner, end-to-end encryption, or combined archive download. Recipients download files individually. Privacy and abuse information is at `/privacy`; before production, confirm a private abuse contact and retention/legal language with the operator.

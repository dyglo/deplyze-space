# Production readiness — 15 October 2026

Status: implementation verified locally; staging Worker and D1 deployed; **not ready for production cutover**. R2 requires dashboard activation. No production DNS, domain assignments, or existing sites were changed.

## Verified

- Frontend and Worker TypeScript checks, production Next.js build, Worker deployment dry run.
- Thirteen unit/integration tests using Cloudflare's local Workers, D1, R2 and S3 runtime. Actual multipart upload and binary streaming download with matching SHA-256; no mocked API responses.
- Empty objects, Unicode names, path/header validation, aggregate transfer limits, immediate expiry, passwords, unauthorized access, guess throttling, CORS, cancellation, repeatable cleanup, and atomic concurrent quotas.
- Four desktop/mobile Chromium browser tests: actual multipart upload, pause/reload/recovery without a second transfer, QR pixel decoding to the exact share URL, separate-browser-context download with correct filename and SHA-256, password unlock, multiple/empty files, starting over and invalid links.
- Cloudflare MCP registration recovered following reauthorization. The connected account changed to `b6683d42632a146d7b07fad1a528a8cb` (guidenow7@gmail.com). Reads inspected existing resources before creating the named staging resources.
- Hosted D1 database `deplyze-space-staging`, ID `a372c702-cb31-429d-ad69-a6c4d142f534`, created and schema applied. Migration recorded in `d1_migrations`. A hosted concurrency check admitted exactly 10 of 12 quota reservations, rejected two, and cleaned its records; reserved bytes and test rows returned to zero.
- Actual application Worker `deplyze-space-staging` uploaded successfully through the Cloudflare API (HTTP 200). Uploads are disabled, R2 is not bound, S3 credentials are absent, and a signing secret was generated/stored without disclosure. The staging workers.dev hostname is enabled. No cleanup Cron is registered yet because storage configuration is incomplete.

Backend staging URL: https://deplyze-space-staging.deplyze-space-b6683d42.workers.dev

This is an incomplete backend deployment, not a working file-sharing preview. The public health request could not be verified: the execution network returned `403 Forbidden: requests to ...workers.dev are not allowed`. This was a network-policy denial, not an observed Worker response.

## Current genuine blockers

1. R2 reads and `POST /accounts/b6683d42632a146d7b07fad1a528a8cb/r2/buckets` return Cloudflare **10042: Please enable R2 through the Cloudflare Dashboard**. The operator must activate R2 in this account, or reconnect the intended account if the account change was accidental. No bucket was created; no existing bucket was modified.
2. The execution network disallows the new workers.dev host, R2 S3 endpoints and browser downloads from `cdn.playwright.dev`. Hosted end-to-end verification needs authorized network access to the eventual frontend, API and R2 hosts. System Chromium worked locally. Firefox/WebKit and real mobile hardware remain unverified.

Historical pre-reauthorization calls in account `34c5468ebfcd71e2a958b25cfb0bde40` returned error 10000 for R2/D1 creation. They were not retried against that old account after reauthorization. The connector's temporary `Unknown tool` errors are resolved and no longer a blocker.

## Remaining release work

- Reinspect the named resources after R2 activation. Create only the missing `deplyze-space-staging` private bucket. Keep public bucket domains disabled; create bucket-scoped S3 credentials and store them as Worker secrets. Apply exact-origin CORS, lifecycle safeguards, the R2 binding and cleanup Cron.
- Deploy a separate Vercel staging frontend and configure exact frontend/API/share origins. `UPLOADS_ENABLED` must stay false until storage, quotas and CORS are verified. The full deployment script checks the staging account, resource names and origins; it does not switch production domains.
- Repeat actual uploads against hosted R2, including signed Content-Length and MD5 enforcement, 2 GiB boundary transfers, concurrent actual uploads, retries, expiration, cleanup and separate devices. Local behavior does not certify hosted R2 enforcement.
- Confirm paid Workers CPU capacity and measure the 600,000-iteration PBKDF2 latency. Confirm a private abuse contact and the operator's privacy/retention language.
- Inspect the live domain's current project and DNS, stage the concrete production build, and obtain approval before the domain cutover. No cutover approval has been requested or granted.

## Implementation limits

Recovery re-uploads unfinished parts; it does not resume at the last byte. Completed file objects are reused after verification. After reload, reselect identical files and the original expiration/password; fingerprints prevent mixing contents. Storage denial prevents recovery across reloads. Cron plus required bucket lifecycle safeguards handle abandonment. Downloads already in progress may finish after expiry; new requests are rejected immediately.

Files download individually; there is no archive endpoint. No malware scanning or end-to-end encryption is claimed. Anonymous network quotas do not stop distributed abuse. Monitor admission counts, reserved bytes, cleanup failures and billing, and add WAF/Turnstile when justified before broad public exposure.

The SDK bundle uses its own DOM-independent XML parser because the browser parser requires DOMParser, absent in Workers. Ordered multipart receipts are verified by R2 and final object size is checked with HEAD. The local S3 emulator lacks ListParts. Hosted D1's query API rejected the earlier trigger migration, so quotas now use CHECK constraints and reservations in one atomic D1 batch; those statements work through the hosted API as well as the Worker binding.

## Cost estimate

Current [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) were retrieved on 15 October 2026. Workers Paid has a $5/month base. R2 Standard lists $0.015/GB-month, $4.50/million Class A operations and $0.36/million Class B operations, with 10 GB-month, 1 million Class A and 10 million Class B operations included monthly. R2 egress has no charge. D1 Paid includes 25 billion rows read, 50 million rows written and 5 GB storage monthly before overages.

At low request volume and the configured roughly 40 GiB storage ceiling, plan approximately **$5–6/month for Cloudflare**, before overages, taxes and any Vercel plan charges. This is a planning estimate, not a cap or a subscription already purchased. A 1 GiB upload creates 128 part PUTs plus initiation/completion and about 133 Worker control requests. One such transfer held seven days consumes roughly 0.233 GiB-month. Hostile request traffic, interrupted multipart storage, password CPU and platform rounding can add cost. Configure provider usage alerts before launch; data quotas are not billing guarantees.

# Verification — 16 October 2026

Production frontend: https://www.deplyze.space. The apex https://deplyze.space redirects to www. Existing UI and infrastructure are preserved; no duplicate project, database, bucket or Worker was created.

## Root causes and repairs

The public domains served the existing Next.js application with the correct Worker API URL, but neither domain was in the Worker origin allowlist or the private R2 bucket CORS policy. Browser Send reproduced `Failed to fetch`; an actual www-origin preflight returned HTTP 403 `Origin not allowed`. Both exact HTTPS origins are now allowed at both layers. An unrelated origin remains rejected. New share URLs use the real www domain.

The earlier staging work also found hosted password creation failing before D1 insertion. Logs showed native PBKDF2 `NotSupportedError`; a JavaScript fallback exceeded the hosted CPU limit. Password derivation now runs in the existing Vercel Node function, protected by a matching encrypted server credential. It retains PBKDF2-SHA256 at 600,000 iterations and the original digest format. No hashing work factor was lowered. The Worker refuses redirects and retains transfer authorization. Local Worker integration tests call the actual Node handler.

Requests now have deadlines and actionable transport/platform errors. The minimalist interface is unchanged.

## Executed checks

- 19 local unit/integration tests pass; frontend and Worker TypeScript pass; the optimized Next.js build passes.
- Four local Chromium tests pass, covering desktop/mobile, multipart transfer, QR decoding, separate-context SHA-256, password unlock, interruption/reload recovery and invalid links.
- Hosted desktop suite passes against the real domain: text, PNG, PDF, empty file and a binary file larger than one 8 MiB part; automatic retry, explicit pause, reload and recovery without creating a second transfer; QR pixel decoding, QR download, link copy and five separate-context downloads with matching SHA-256.
- Hosted mobile Chromium suite also passes on the real domain: five files, password creation, wrong-password rejection, unlock, QR/copy/download, unauthorized request rejection and five SHA-256 matches from a separate browser context. Both hosted suites passed in 3.5 minutes with no page exceptions. Exact hashes and sanitized request statuses are in VERIFICATION-2026-10-16.json.
- Original failed real-domain text upload succeeds after the CORS repair. Its 53-byte download SHA-256 is `f5a6f2547f4db31cc2eeb52be264bd35926cc33dee404cbe68145b51b3d011e4`.
- Hosted API rejects a transfer of 2 GiB plus one byte and a selection of 51 files with HTTP 400 and correct production CORS headers. A 2 GiB declaration was accepted in a controlled test; only an 8 MiB part was uploaded, then cancelled. This is not a full 2 GiB throughput certification.
- Hosted R2 rejected an oversized signed part with 403 and corrupt bytes with 400. The correctly sized/checksummed part uploaded successfully. Cancellation immediately rejected access/completion with 410.
- D1 rejected attempts to exceed IP byte/count, global byte and stored/reserved-byte constraints; before/after quota state was identical. Hourly admission throttling returned 429 with Retry-After. Test-only quota credits remove recorded benchmark admissions without changing quota policies or storage reservations.
- Expiration rejected metadata and a previously issued content URL with 410. Scheduled cleanup subsequently removed the expired transfer and both cancelled fixtures from D1. R2 object listings for their three exact prefixes are empty. Storage-budget bytes equal the sum of remaining declared transfers.

## Deployed resources

Cloudflare account `b6683d42632a146d7b07fad1a528a8cb`; Worker/R2/D1 retain the name `deplyze-space-staging` although they now serve the public domains. D1 ID: `a372c702-cb31-429d-ad69-a6c4d142f534`; migration `0001_transfers.sql` is applied. Uploads are enabled. The R2 bucket is private. Cron runs every 15 minutes; bucket safeguards abort incomplete uploads after 24 hours and delete leftovers after 31 days. Credentials remain encrypted. No values were printed or committed.

Verified frontend candidate: commit `e03609a58fdc87b58c496217642712ec2d51ef06`, Vercel deployment `dpl_24m7SzfrZjDcL2nHBWmMHTsV7wdQ`, both public aliases assigned. Worker deployment `b35947f1-5fdc-4766-b02b-c22197bf6ba8`, version `98ec25cd-4bbe-4a58-8de1-c0623dddb628` at 100%. The Worker source is the previously verified password-service implementation; this release updated origins, canonical sharing and service URL. The frontend has NEXT_PUBLIC_API_URL set to the existing Worker origin, with the server-only password credential configured for production and preview.

## Operational limits

Physical mobile hardware, Firefox/WebKit and an actual full 2 GiB upload/download remain unverified. Mobile results use Chromium device emulation. There is no malware scanning, end-to-end encryption or combined archive download. IP quotas do not prevent distributed abuse; monitoring and a private abuse-reporting channel remain operator follow-ups.

GitHub Actions cannot start because GitHub reports the account is locked due to a billing issue. Local checks and actual Vercel/Cloudflare/browser verification are independent passes; no CI pass is claimed. Domain-registry reads remain forbidden through the connector, but deployment reads and actual HTTPS requests verify the real domain assignment.

Rollback: pause upload admissions if needed; preserve storage and migrations. The prior frontend deployment supports the same internal password endpoint. Keep the current production origin policies when rolling Worker code back; old Worker configurations omit the real domains. See README for the deployment and rollback procedure.

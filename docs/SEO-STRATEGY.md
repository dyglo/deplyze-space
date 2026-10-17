# Deplyze Space: SEO audit and organic growth plan

Audit date: 16 October 2026. Product: https://www.deplyze.space/. Baseline source: `ce111f6` on main, verified by Vercel deployment metadata. This environment's initial checkout was behind main; it was fast-forwarded before work.

## Keyword-to-page strategy (selected before implementation)

Research method: live search queries on 16 October 2026 for the eight requested keyword families, existing production HTML, repository capabilities, and current Google Search Central guidance. Search results demonstrate competing pages and intent, not measured query volume. No Keyword Planner, paid keyword dataset, or authorized Search Console connection is available. **Volume, keyword difficulty, current Google position, and traffic are unknown for every target below.** Priority is a qualitative judgment about relevance and specificity, not an asserted ranking probability. The search tool's result order is not a Google ranking report.

| Query family | Intent and observed competition | Page / priority |
| --- | --- | --- |
| file sharing without signup | Complete a transfer without an account. Dedicated competitor pages include [Khamli](https://khamli.com/file-sharing-without-signup) and [NexusDrive](https://www.nexusdrive.org/). | Homepage primary. Try more specific query combinations such as “file sharing without signup with expiry.” |
| share files with a link | Get a usable link immediately. [Google Drive Help](https://support.google.com/drive/answer/2494822?co=GENIE.platform%3DDesktop&hl=en) and [WeTransfer link sharing](https://wetransfer.com/resources/browse/share-files-download-link) appear in research. | Homepage primary; describe the actual upload → link → download workflow. |
| password protected file sharing | Protect access; avoid implying end-to-end encryption. [SafeShare](https://safeshare.co/) and [AnyRelay](https://anyrelay.net/) position around passwords and expiry. | Homepage FAQ secondary. A distinct practical safety guide only if real questions justify it. |
| share files with QR code | Often a how-to or device-sharing query. [Samsung Quick Share](https://www.samsung.com/us/apps/quick-share/) competes with native device workflows. | Homepage FAQ secondary. A browser-specific original walkthrough is the best candidate for a future guide. |
| free file sharing | Immediate tool intent; established services such as [Jumpshare](https://jumpshare.com/file-sharing) compete here. | Homepage supporting phrase; broad visibility is a longer-term ambition. |
| send files online | Immediate tool intent. [WeTransfer](https://wetransfer.com/resources/free-file-transfer) and [TempSend](https://www.tempsend.com/) offer direct transfer workflows. | Homepage description and concise explanation; no near-duplicate landing page. |
| transfer large files | Tool intent with widely differing size expectations. [storage.to](https://storage.to/) advertises larger limits than this application's verified 2 GiB cap. | Homepage supporting intent with the 2 GB limit stated clearly. Avoid “unlimited” claims. |
| WeTransfer alternative | Comparison intent; research returned [TechRadar](https://www.techradar.com/best/the-best-alternatives-to-wetransfer), [Jotform](https://www.jotform.com/blog/wetransfer-alternatives/), and many comparison sites. | Defer a standalone page until an independently tested comparison adds original value. Never frame a smaller size cap as superiority. |

No extra SEO landing pages or blog articles were generated. `/privacy` addresses trust, retention, passwords and acceptable use, with its own title and canonical; it is not a keyword acquisition page.

## Findings and implementation

- Production HTML used the generic “Less is More” title and v0 generator metadata. Homepage and privacy page shared their metadata; canonical, OG and X cards were absent. Added unique titles, descriptions, public canonical URLs and a separate 1200 × 630 PNG social preview using the existing name, colors and tagline.
- Kept the Next.js metadata API. In Next.js 16.4, `metadataBase` normalization removed the root slash. Explicit absolute metadata URLs preserve the required canonical `https://www.deplyze.space/`. The privacy canonical is `https://www.deplyze.space/privacy`.
- Default layout is `noindex, nofollow`. Only `/` and `/privacy` opt into `index, follow`. Transfer pages retain their existing noindex metadata and do not inherit a homepage canonical, product schema, or public social URL. Next.js headers add `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` to `/s/*` and `/api/*`, including the password derivation endpoint. Existing Worker responses already add `noindex, nofollow`; backend logic was not changed.
- Added generated `robots.txt` and an explicit two-page XML sitemap. Robots permits crawling so Google can see noindex responses. Private identifiers are absent from public navigation, sitemap and structured data. Robots directives do not replace authorization.
- Vercel confirms the existing apex → www redirect is configured as 308; preserved it. No infrastructure, CORS, storage, access-control, upload, or password code/configuration was changed.
- Moved the existing interactive homepage intact into a client component, leaving a server page for metadata and a short native-details FAQ. Preserved the visual identity, hero and functional animations. Added an accessible name to the file input.
- Deferred `qrcode` until the share panel mounts, with cleanup preventing stale draws. The existing browser tests decode the generated QR and verify the original URL. System fonts were already used, with no external font request; no speculative font changes were made.
- Added an ESLint command/configuration because the repository had no lint command. It retains existing full navigation and local blob-preview behavior. One warning remains in unchanged upload retry code (`no-unused-expressions`); zero lint errors.

## Structured data

Homepage JSON-LD uses `WebSite` with the verified product name, URL, description and English language. JSON syntax and expected properties are checked against the rendered production build. There are no ratings, fabricated reviews, private IDs, or unsupported capabilities.

[Google's software app rich result requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app) include a genuine review or aggregate rating. Those do not exist here, so SoftwareApplication markup was not added. There is no verified separate company identity to justify Organization credentials or corporate properties. `WebSite` supports [site-name understanding](https://developers.google.com/search/docs/appearance/site-names); it is not a claim of rich-result eligibility. An external Google rendering/validation test remains a manual verification below.

## Brand assets: resolved in follow-up

The original audit found only v0 icons and placeholders. The operator subsequently supplied `icons8-file.svg` and `icons8-file-500.png`; both are preserved unchanged at `public/brand/deplyze-space.svg` and `public/brand/deplyze-space.png`. All active favicon and touch declarations now use those drawings, with generated 16/32/48 ICO frames, a 96-square PNG for search/browser use, a 180-square Apple icon, and 192/512 PNG manifest icons. The vector preserves detail at 512 pixels without enlarging the 500-pixel PNG. Generated icons use a white canvas behind the original black lines for dark-tab/home-screen visibility; paths, colors and proportions are unchanged. Old v0 files and unused logo placeholders were removed.

The manifest retains browser display mode and the root start URL, without a service worker or upload caching. See `BRANDING.md` for paths and regeneration. The separate typography-only social card remains unchanged. Google favicon adoption still depends on recrawling; deployment is not proof of search-result display.

## Measured before and after (local lab only)

Same workspace and Chromium, Next.js production builds, Lighthouse 13.5.0 with default simulated throttling and one cold-browser run per build/device. There is no field INP measurement. The scores do not claim a production ranking or speed gain.

| Local metric | Mobile before → after | Desktop before → after |
| --- | --- | --- |
| Performance | 97 → 97 | 100 → 100 |
| Accessibility | 94 → 100 | 94 → 100 |
| SEO / best practices | 100 / 100 → 100 / 100 | 100 / 100 → 100 / 100 |
| LCP | 2.4 s → 2.4 s | 0.5 s → 0.5 s |
| TBT | 130 ms → 90 ms | 0 ms → 0 ms |
| CLS | 0 → 0 | 0 → 0 |
| Initial page transfer size | 217 KiB → 212 KiB | 217 KiB → 212 KiB |

Initial script transfer decreased from 209,173 to 201,519 bytes. The delayed QR chunk loads after a successful transfer and remains covered by actual QR-decode browser tests. The clear measured change is accessibility; LCP did not materially change. Raw local Lighthouse reports are in ignored `.artifacts/seo/`; version, timestamps, environment, exact settings, and numeric results are preserved in `SEO-VERIFICATION.json`.

## Production access and measurement limits

Direct HTTPS/browser access to production from the managed workspace returned a proxy CONNECT 403. Network policy was not bypassed or changed. Authenticated Vercel tools could fetch public production HTML and inspect the existing project, deployment and domain settings. No Chrome DevTools MCP or Search Console tool is configured. Production Lighthouse, field Core Web Vitals, INP, and CrUX coverage cannot be certified from this environment. Local Lighthouse lab measurements and exact test conditions are recorded in `SEO-VERIFICATION.json`; they are not production or field data. TBT is not INP. A Lighthouse SEO score alone does not establish canonical correctness, indexing or rankings.

## Search Console: operator actions

1. Open [Google Search Console](https://search.google.com/search-console), select the verified **Domain property `deplyze.space`**. Do not add another verification tag.
2. In **Sitemaps**, submit **https://www.deplyze.space/sitemap.xml**. Confirm Google can fetch it and reports only the two public URLs. Retire obsolete submitted Firebase sitemaps only after inspecting their contents and current relevance.
3. Inspect `https://www.deplyze.space/` and `https://www.deplyze.space/privacy`, choose **Test live URL**, review fetched HTML, screenshot, indexing permission and declared canonical, then request indexing once if appropriate. Check Google's selected canonical later; submission is not indexing confirmation.
4. Test a synthetic nonexistent `/s/` URL for its noindex response. For a real transfer, inspect only an operator-owned non-sensitive test transfer if necessary; do not publish a bearer URL, submit it for indexing, or put it in an exported report. Expect “Excluded by noindex” for crawled private links. API responses must also retain X-Robots-Tag. See [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).
5. Record the actual SEO deployment time from Vercel. The search research still returned historical “QuickDrop by Deplyze” copy with “no size limit” at `https://deplyze.space/`. Treat that as historical search content, not current product truth or a measured current Google position. In Performance → Search results, filter dates from the SEO deployment onward and exact public page URLs; export query/page/country/device data. Compare equal time windows and separate branded/non-branded queries. Since old and new homepages reuse URLs, a URL filter alone cannot separate generations: the date boundary is essential.
6. In Page indexing, review historical Firebase URLs separately. Map only genuinely equivalent public URLs to specific permanent destinations; leave removed content as real 404/410. Do not redirect every old path to the homepage. Inspect old URL inventory before proposing changes. Use Removals only for urgent exposure, alongside a permanent fix.
7. Run the homepage through [Rich Results Test](https://search.google.com/test/rich-results) to inspect Google's rendered result; WebSite alone may produce no eligible rich-result items. Use [Schema Markup Validator](https://validator.schema.org/) to inspect WebSite syntax/type. Do not invent review markup to silence eligibility notices.
8. Run [PageSpeed Insights](https://pagespeed.web.dev/) on the public domain, mobile and desktop. Save repeated runs with version, date, throttling and region, and review real Core Web Vitals when there is sufficient field coverage. Establish the hosted baseline before claiming a production speed gain.

## Prioritized 30/60/90-day plan

**Days 1–30: make the baseline trustworthy.** Verify the supplied brand favicon after Google recrawls; verify Google-selected canonicals, sitemap processing, public indexing and private exclusions. Export weekly Search Console data for current public URLs only and log rollout dates. Record public-page impressions, clicks, CTR and average position by query/device/country, keeping branded and non-branded segments separate; treat average position as an aggregate, not a fixed rank. Establish production mobile PSI and field CWV coverage. Ask a small set of actual users about confusing limits, password handling and QR use. Fix defects before increasing reach. No numerical growth promise is justified without a baseline.

**Days 31–60: publish one useful resource if evidence supports it.** Prioritize a tested “share files with a QR code without an account” walkthrough, with original mobile/desktop screenshots, real 2 GB/50-file/expiry limits and privacy caveats. Alternatively address password/expiry questions if those earn more qualified impressions or support requests. Link it naturally from the FAQ and back to the uploader; add it to the sitemap only when substantial and published. Offer maintainers of relevant resource lists an accurate product description only where useful; all outreach remains manual and permission-based. No automated outreach was sent. Measure query coverage, guide → uploader navigation and user feedback; any future transfer metrics must be aggregate and exclude tokens, filenames, passwords and private URLs.

**Days 61–90: refine from observed behavior.** Compare equal 28-day periods and account for query mix, geography and seasonality. Improve snippets for pages earning relevant impressions but weak CTR; avoid judging tiny samples. If original evidence and user demand justify it, publish one honest WeTransfer workflow comparison with dated first-hand tests and clear disadvantages as well as advantages. Expand only where there is a distinct user problem. Review failed uploads and mobile experience alongside organic growth so acquisition does not outpace reliability or quotas. Recheck private noindex and public sitemaps after every route change.

Success criteria: correct public indexing and private exclusions, useful non-branded query coverage, reliable transfers, and improving qualified search engagement relative to an observed baseline. Rankings, crawl timing, favicon display and growth are not guaranteed.

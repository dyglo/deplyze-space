# Deplyze Space icon assets

The operator supplied `icons8-file.svg` and `icons8-file-500.png` after the Phase 2 audit. The originals are preserved byte-for-byte:

| Original | Repository path | SHA-256 |
| --- | --- | --- |
| SVG, 100 × 100 viewBox | `public/brand/deplyze-space.svg` | `06683f29928cd3d453949c62ed6ef7b82880cdc12cbfdf72edc54845f77e7092` |
| PNG, 500 × 500 | `public/brand/deplyze-space.png` | `90489cb77b7c4b8c95baa41b3322af46d38b2a27787a5d533c628183b5266bb8` |

Run `node scripts/generate-brand-icons.mjs` after `npm ci` to regenerate the derivatives from the SVG. The generator preserves the full viewBox, original black paths and proportions. It places them on an opaque white canvas to remain visible in dark browser tabs and on Apple home screens; the source artwork is not recolored or edited. The 512-pixel icon is rendered from the vector, not enlarged from the supplied 500-pixel PNG.

| Production URL | Purpose |
| --- | --- |
| https://www.deplyze.space/favicon-96x96.png | Stable 96 × 96 PNG favicon, suitable for Google Search and modern browsers |
| https://www.deplyze.space/favicon.ico | Browser fallback with 16, 32 and 48-pixel PNG frames |
| https://www.deplyze.space/apple-touch-icon.png | 180 × 180 Apple touch icon |
| https://www.deplyze.space/icon-192.png | 192 × 192 manifest icon |
| https://www.deplyze.space/icon-512.png | 512 × 512 manifest icon |
| https://www.deplyze.space/brand/deplyze-space.svg | Unmodified original SVG |
| https://www.deplyze.space/brand/deplyze-space.png | Unmodified original PNG |

`app/layout.tsx` is the only favicon/touch declaration source. There are two complementary favicon formats with explicit sizes, one Apple icon, and no theme-dependent or file-based declarations. `app/manifest.ts` references the 192/512 PNGs with purpose `any`; the artwork was not redesigned as a maskable icon. Browser display mode and upload behavior remain unchanged. Social preview metadata continues to use the existing separate 1200 × 630 card.

Old v0 SVG/PNG icons and unused placeholder logo assets were removed. Their old URLs return 404 and are no longer linked. Robots permits the new public assets; the private-transfer/API noindex rules do not match them. Google still controls favicon recrawl and display timing. After deployment, use Search Console URL Inspection on the homepage and request a recrawl if appropriate; no sitemap resubmission or new ownership verification is needed for this icon-only update.

Verification commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, and `CHROMIUM_PATH=/usr/bin/chromium npm run test:seo`. The browser suite checks exact favicon/touch links, ICO frame sizes, PNG dimensions, manifest targets, crawlable responses, retired URLs, and the existing SEO/privacy rules on desktop and mobile. Production verification must additionally check the actual `www.deplyze.space` deployment and asset responses.

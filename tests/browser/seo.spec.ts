import { test, expect } from "@playwright/test";

const origin = "https://www.deplyze.space";

test("public metadata is unique and private routes stay out of search", async ({
  page,
  request,
}) => {
  const titles: string[] = [];
  for (const path of ["/", "/privacy"]) {
    await page.goto(path);
    titles.push(await page.title());
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}${path}`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `${origin}${path}`,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${origin}/social-preview.png`,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator("h1")).toHaveCount(1);
  }
  expect(new Set(titles).size).toBe(2);

  // Synthetic identifier only: never publish a real private transfer in reports.
  const privatePath = `/s/${"0".repeat(32)}`;
  const privateResponse = await request.get(privatePath);
  expect(privateResponse.headers()["x-robots-tag"]).toContain("noindex");
  const html = await privateResponse.text();
  expect(html).toMatch(/name="robots" content="noindex, nofollow"/);
  expect(html).not.toContain('rel="canonical"');
  expect(html).not.toContain("application/ld+json");
  const apiResponse = await request.get("/api/internal/password");
  expect(apiResponse.status()).toBe(405);
  expect(apiResponse.headers()["x-robots-tag"]).toContain("noindex");

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  // Do not disallow private paths: crawlers need to see their noindex responses.
  expect(await robots.text()).not.toContain("Disallow: /s");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])).toEqual([
    `${origin}/`,
    `${origin}/privacy`,
  ]);
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).start_url).toBe("/");
  const preview = await request.get("/social-preview.png");
  expect(preview.headers()["content-type"]).toContain("image/png");
  const png = await preview.body();
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});

test("public explanation and structured data are server rendered without JavaScript", async ({
  browser,
  page: interactive,
}, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Share files with a link. No signup." }),
  ).toBeVisible();
  await page
    .getByText("How do I share files with a QR code?", { exact: true })
    .click();
  await expect(
    page.getByText("After uploading, download the QR code", { exact: false }),
  ).toBeVisible();
  const json = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  const schema = JSON.parse(json!);
  expect(schema["@type"]).toBe("WebSite");
  expect(schema.url).toBe(`${origin}/`);
  expect(json).not.toMatch(/aggregateRating|review|\/s\//);
  await context.close();

  await interactive.goto("/");
  await expect(
    interactive.getByRole("heading", { name: "Less is More." }),
  ).toBeVisible();
  await expect(interactive.locator(".hero-copy")).toHaveCSS("opacity", "1");
  await expect(interactive.locator(".drop-zone")).toHaveCSS("opacity", "1");
  await interactive.screenshot({
    path: `.artifacts/seo/${info.project.name}-home.png`,
    fullPage: true,
  });
});

test("supplied brand icons have explicit declarations and crawlable assets", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const icons = page.locator('link[rel="icon"]');
  await expect(icons).toHaveCount(2);
  await expect(
    page.locator('link[rel="icon"][href="/favicon-96x96.png"]'),
  ).toHaveAttribute("sizes", "96x96");
  await expect(
    page.locator('link[rel="icon"][href="/favicon.ico"]'),
  ).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-touch-icon.png",
  );
  expect(
    await icons.evaluateAll((nodes) =>
      nodes.some((node) => node.hasAttribute("media")),
    ),
  ).toBe(false);
  const manifestResponse = await request.get("/manifest.webmanifest");
  const manifest = await manifestResponse.json();
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
    "/icon-192.png",
    "/icon-512.png",
  ]);
  for (const [path, size] of [
    ["/favicon-96x96.png", 96],
    ["/apple-touch-icon.png", 180],
    ["/icon-192.png", 192],
    ["/icon-512.png", 512],
  ] as const) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(response.headers()["x-robots-tag"] || "").not.toContain("noindex");
    const png = await response.body();
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  const bytes = await ico.body();
  expect(bytes.readUInt16LE(2)).toBe(1);
  expect(bytes.readUInt16LE(4)).toBe(3);
  expect([bytes[6], bytes[22], bytes[38]]).toEqual([16, 32, 48]);
  const svg = await request.get("/brand/deplyze-space.svg");
  expect(svg.status()).toBe(200);
  expect(await svg.text()).toContain('viewBox="0 0 100 100"');
  for (const old of [
    "/icon.svg",
    "/icon-light-32x32.png",
    "/icon-dark-32x32.png",
    "/apple-icon.png",
  ]) {
    expect((await request.get(old)).status()).toBe(404);
  }
});

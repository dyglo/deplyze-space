import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import jsQR from "jsqr";

const api = "https://deplyze-space-staging.deplyze-space-b6683d42.workers.dev";
const shareOrigin = process.env.HOSTED_SHARE_ORIGIN || "https://www.deplyze.space";
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
function samplePdf() {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Count 1/Kids[3 0 R]>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 16 16]/Resources<<>>>>",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 4\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<</Size 4/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== "passed") {
    console.log(
      "Hosted page state:",
      await page
        .locator("main")
        .innerText()
        .catch(() => "Page closed"),
    );
    await mkdir(".artifacts", { recursive: true });
    await page
      .screenshot({
        path: `.artifacts/${info.project.name}-failure.png`,
        fullPage: true,
      })
      .catch(() => {});
  }
});

test("real R2 multipart recovery, multiple formats, QR and isolated recipient integrity", async ({
  page,
  browser,
  request,
}, info) => {
  const mobile = info.project.name === "mobile-staging";
  const password = mobile ? "staging test password 2026" : "";
  const files = [
    {
      name: "staging.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Real hosted transfer — 2026-10-16"),
    },
    {
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
        "base64",
      ),
    },
    {
      name: "sample.pdf",
      mimeType: "application/pdf",
      buffer: samplePdf(),
    },
    {
      name: "empty.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(0),
    },
    {
      name: "multipart.dat",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(8 * 1024 ** 2 + 37, 0x5a),
    },
  ];
  const errors: string[] = [];
  const statuses: { method: string; path: string; status: number }[] = [];
  let session:
    | { id: string; token: string; files: { id: string; name: string }[] }
    | undefined;
  let creations = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => {
    const url = new URL(r.url());
    console.log(
      "Request failed:",
      r.method(),
      url.origin + url.pathname,
      r.failure()?.errorText,
    );
  });
  page.on("response", async (r) => {
    const url = new URL(r.url());
    if (url.origin !== api) return;
    if (r.status() >= 400)
      console.log("API failure:", url.pathname, r.status());
    statuses.push({
      method: r.request().method(),
      path: url.pathname,
      status: r.status(),
    });
    if (
      url.pathname === "/transfers" &&
      r.request().method() === "POST" &&
      r.status() === 201
    ) {
      session = await r.json();
      creations++;
    }
  });
  let reached!: () => void, release!: () => void;
  const partReached = new Promise<void>((r) => {
    reached = r;
  });
  const held = new Promise<void>((r) => {
    release = r;
  });
  let interrupted = false,
    retried = false;
  await page.route("https://*.r2.cloudflarestorage.com/**", async (route) => {
    const part = new URL(route.request().url()).searchParams.get("partNumber");
    if (!mobile && part === "1" && !retried) {
      retried = true;
      await route.abort("connectionreset");
      return;
    }
    if (!mobile && part === "2" && !interrupted) {
      interrupted = true;
      reached();
      await held;
    }
    try {
      await route.continue();
    } catch {
      /* Pause aborts the held request. */
    }
  });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(files);
  if (password)
    await page.getByPlaceholder("At least 12 characters").fill(password);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  if (!mobile) {
    await Promise.race([
      partReached,
      page
        .locator(".transfer-error")
        .filter({ hasText: /\S/ })
        .waitFor()
        .then(async () => {
          throw new Error(await page.locator(".transfer-error").innerText());
        }),
    ]);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    release();
    await expect(
      page.getByRole("button", { name: "Retry upload" }),
    ).toBeVisible();
    await page.reload();
    await page.locator("input[type=file]").setInputFiles(files);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  }
  await Promise.race([
    expect(page.getByText("Your private link")).toBeVisible({
      timeout: 180000,
    }),
    page
      .locator(".transfer-error")
      .filter({ hasText: /\S/ })
      .waitFor({ timeout: 180000 })
      .then(async () => {
        throw new Error(await page.locator(".transfer-error").innerText());
      }),
  ]);
  expect(creations).toBe(1);
  expect(session).toBeDefined();
  const url = await page.locator(".link-line span").innerText();
  expect(url).toBe(
    `${shareOrigin}/s/${session!.id}`,
  );
  const pixels = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      height: c.height,
      data: Array.from(
        c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
      ),
    }));
  expect(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height, {
      inversionAttempts: "attemptBoth",
    })?.data,
  ).toBe(url);
  await page
    .getByRole("button", { name: "Copy share link", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const qrDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download QR", exact: true }).click();
  expect((await qrDownload).suggestedFilename()).toMatch(/\.png$/);
  await mkdir(".artifacts", { recursive: true });
  await page.screenshot({
    path: `.artifacts/${info.project.name}-share.png`,
    fullPage: true,
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const recipient = await context.newPage();
  await recipient.goto(url);
  if (password) {
    expect(
      (await request.get(`${api}/transfers/${session!.id}`)).status(),
    ).toBe(401);
    expect(
      (
        await request.post(`${api}/transfers/${session!.id}/unlock`, {
          data: { password: "incorrect password" },
        })
      ).status(),
    ).toBe(401);
    await recipient.getByLabel("Password", { exact: true }).fill(password);
    await recipient.getByRole("button", { name: "Unlock transfer" }).click();
  }
  await expect(
    recipient.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(files.length);
  const checks: { file: string; sha256: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const downloadPromise = recipient.waitForEvent("download");
    await recipient
      .getByRole("button", { name: "Download", exact: true })
      .nth(i)
      .click();
    const downloaded = await downloadPromise;
    const original = files.find(
      (f) => f.name === downloaded.suggestedFilename(),
    );
    expect(original).toBeDefined();
    const actual = sha(await readFile((await downloaded.path())!));
    expect(actual).toBe(sha(original!.buffer));
    checks.push({ file: original!.name, sha256: actual });
  }
  await recipient.goto(
    `${shareOrigin}/s/invalid`,
  );
  await expect(recipient.getByRole("main").getByRole("alert")).toHaveText(
    "Transfer not found",
  );
  expect(
    (
      await request.post(`${api}/transfers/${session!.id}/complete`, {
        headers: { Authorization: "Bearer wrong" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(
        `${api}/transfers/${session!.id}/files/${session!.files[0].id}/content`,
      )
    ).status(),
  ).toBe(403);
  expect(errors).toEqual([]);
  await writeFile(
    `.artifacts/${info.project.name}-result.json`,
    JSON.stringify(
      {
        transferId: session!.id,
        url,
        checks,
        statuses,
        recovered: !mobile,
        password: !!password,
        errors,
      },
      null,
      2,
    ),
  );
  await context.close();
});

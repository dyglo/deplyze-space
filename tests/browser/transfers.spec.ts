import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
test("multipart upload, QR, and intact download in another browser context", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Less is More." }),
  ).toBeVisible();
  const data = Buffer.alloc(8 * 1024 ** 2 + 9, 0x4a),
    name = "报告 unusual file.html";
  await page
    .locator("input[type=file]")
    .setInputFiles({ name, mimeType: "text/html", buffer: data });
  let creations = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/transfers")
      creations++;
  });
  let release: () => void = () => {},
    reached: () => void = () => {};
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    partReached = new Promise<void>((resolve) => {
      reached = resolve;
    });
  let interrupted = false;
  await page.route("**/cdn-cgi/local/r2/s3/**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("partNumber") === "2" &&
      !interrupted
    ) {
      interrupted = true;
      reached();
      await held;
    }
    try {
      await route.continue();
    } catch {
      /* Pausing aborts the held request. */
    }
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await partReached;
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  release();
  await expect(
    page.getByRole("button", { name: "Retry upload" }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name, mimeType: "text/html", buffer: data });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Your private link")).toBeVisible({
    timeout: 90000,
  });
  const url = await page.locator(".link-line span").innerText();
  expect(url).toMatch(/^http:\/\/localhost:3000\/s\/[a-f0-9]{32}$/);
  await expect(page.locator("canvas")).toBeVisible();
  expect(creations).toBe(1);
  const qr = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => ({
      width: canvas.width,
      height: canvas.height,
      data: Array.from(
        canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
          .data,
      ),
    }));
  expect(
    jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height, {
      inversionAttempts: "attemptBoth",
    })?.data,
  ).toBe(url);

  await page.screenshot({
    path: `test-results/${info.project.name}-share.png`,
    fullPage: true,
  });
  const other = await browser.newContext({ acceptDownloads: true }),
    recipient = await other.newPage();
  await recipient.goto(url);
  await expect(recipient.getByText(name, { exact: false })).toBeVisible();
  const downloadPromise = recipient.waitForEvent("download");
  await recipient
    .getByRole("button", { name: "Download", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(name);
  const path = await download.path();
  expect(path).toBeTruthy();
  expect(
    createHash("sha256")
      .update(await readFile(path!))
      .digest("hex"),
  ).toBe(createHash("sha256").update(data).digest("hex"));
  await other.close();
  expect(errors).toEqual([]);
});
test("supports empty files, password protection, another transfer and invalid links", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles([
    { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
    { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
  ]);
  await page.getByPlaceholder("At least 12 characters").fill("a long password");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Your private link")).toBeVisible();
  const url = await page.locator(".link-line span").innerText();
  const context = await browser.newContext(),
    recipient = await context.newPage();
  await recipient.goto(url);
  await recipient
    .getByLabel("Password", { exact: true })
    .fill("a long password");
  await recipient.getByRole("button", { name: "Unlock transfer" }).click();
  await expect(
    recipient.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(2);
  await context.close();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("Drop anything here")).toBeVisible();
  await page.goto("/s/invalid");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Transfer not found",
  );
});

import { quotaStatements } from "../worker/src/admission";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { hash, id } from "../worker/src/security";
let mf: Miniflare;
beforeAll(async () => {
  const built = await build({
    entryPoints: ["worker/src/index.ts"],
    bundle: true,
    write: false,
    alias: { "@aws-sdk/xml-builder": "@aws-sdk/xml-builder/dist-cjs/index.js" },
    format: "esm",
    platform: "browser",
    mainFields: ["browser", "module", "main"],
    conditions: ["workerd", "browser"],
    target: "es2022",
    external: ["node:*"],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      port: 8788,
      unsafeTriggerHandlers: true,
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: "2026-10-15",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      r2Buckets: {
        BUCKET: {
          id: "test",
          s3Credentials: { accessKeyId: "test", secretAccessKey: "test" },
        },
      },
      bindings: {
        SIGNING_SECRET: "test-only-signing-key",
        R2_ACCESS_KEY_ID: "test",
        R2_SECRET_ACCESS_KEY: "test",
        R2_ENDPOINT: "http://127.0.0.1:8788/cdn-cgi/local/r2/s3",
        R2_ACCOUNT_ID: "test",
        R2_BUCKET: "test",
        ALLOWED_ORIGINS: "http://localhost:3000",
        SHARE_ORIGIN: "http://localhost:3000",
        UPLOADS_ENABLED: "true",
      },
    }),
  );
  const db = await mf.getD1Database("DB");
  const sql = await readFile("worker/migrations/0001_transfers.sql", "utf8");
  // D1 exec parses one statement per line; preserve trigger as one statement using prepare.
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await db.prepare(statement).run();
});
afterAll(async () => {
  await mf?.dispose();
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
  ip = "192.0.2.1",
) {
  return mf.dispatchFetch(`http://api.test${path}`, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "CF-Connecting-IP": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function create(password?: string) {
  const r = await request("/transfers", "POST", {
    files: [{ name: "empty.html", size: 0 }],
    password,
  });
  expect(r.status).toBe(201);
  return (await r.json()) as {
    id: string;
    token: string;
    files: { id: string }[];
  };
}
describe("local D1 and R2 integration (not remote Cloudflare)", () => {
  it("uploads a real empty object, authorizes and downloads its bytes", async () => {
    const s = await create();
    const root = `/transfers/${s.id}`;
    expect(
      (
        await request(
          `${root}/files/${s.files[0].id}/start`,
          "POST",
          undefined,
          "wrong",
        )
      ).status,
    ).toBe(403);
    expect((await request(root)).status).toBe(410);
    expect(
      (
        await request(
          `${root}/files/${s.files[0].id}/start`,
          "POST",
          undefined,
          s.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(`${root}/complete`, "POST", undefined, s.token)).status,
    ).toBe(200);
    expect((await request(root)).status).toBe(200);
    const signed = await request(
      `${root}/files/${s.files[0].id}/download`,
      "POST",
    );
    const { url } = (await signed.json()) as { url: string };
    const result = await mf.dispatchFetch(url);
    expect(result.headers.get("content-type")).toBe("application/octet-stream");
    expect(result.headers.get("content-disposition")).toContain("attachment");
    expect((await result.arrayBuffer()).byteLength).toBe(0);
    expect(
      (await mf.dispatchFetch(url.replace("signature=", "signature=bad")))
        .status,
    ).toBe(403);
  });
  it("streams actual binary objects intact and denies expired links immediately", async () => {
    const tid = id(),
      fid = id(),
      now = Date.now();
    const bytes = crypto.getRandomValues(new Uint8Array(64000));
    const db = await mf.getD1Database("DB"),
      bucket = await mf.getR2Bucket("BUCKET");
    await db
      .prepare("INSERT INTO transfers VALUES (?,?,?,?,?,?,'ready',?,?,?)")
      .bind(
        tid,
        await hash("owner"),
        null,
        now,
        now + 60000,
        now + 60000,
        bytes.length,
        id(),
        Math.floor(now / 86400000),
      )
      .run();
    await db
      .prepare("INSERT INTO files VALUES (?,?,?,?,?,NULL,1)")
      .bind(fid, tid, "恶意.html", bytes.length, `${tid}/${fid}`)
      .run();
    await db
      .prepare("UPDATE storage_budget SET bytes=bytes+? WHERE id=1")
      .bind(bytes.length)
      .run();
    await bucket.put(`${tid}/${fid}`, bytes);
    const r = await request(`/transfers/${tid}/files/${fid}/download`, "POST");
    const { url } = (await r.json()) as { url: string };
    const content = await mf.dispatchFetch(url);
    expect(
      createHash("sha256")
        .update(new Uint8Array(await content.arrayBuffer()))
        .digest("hex"),
    ).toBe(createHash("sha256").update(bytes).digest("hex"));
    await db
      .prepare("UPDATE transfers SET expires_at=? WHERE id=?")
      .bind(Date.now() - 1, tid)
      .run();
    expect((await mf.dispatchFetch(url)).status).toBe(410);
  });
  it("hides protected metadata and rate limits password guessing", async () => {
    const s = await create("a long password");
    const root = `/transfers/${s.id}`;
    await request(
      `${root}/files/${s.files[0].id}/start`,
      "POST",
      undefined,
      s.token,
    );
    await request(`${root}/complete`, "POST", undefined, s.token);
    expect((await request(root)).status).toBe(401);
    expect(
      (await request(`${root}/unlock`, "POST", { password: "incorrect" }))
        .status,
    ).toBe(401);
    const good = await request(`${root}/unlock`, "POST", {
      password: "a long password",
    });
    const { token } = (await good.json()) as { token: string };
    expect((await request(root, "GET", undefined, token)).status).toBe(200);
    for (let i = 0; i < 4; i++)
      await request(`${root}/unlock`, "POST", { password: "incorrect" });
    expect(
      (await request(`${root}/unlock`, "POST", { password: "a long password" }))
        .status,
    ).toBe(429);
  });
  it("enforces aggregate limits, CORS and completion verification", async () => {
    expect(
      (
        await request("/transfers", "POST", {
          files: [
            { name: "a", size: 2147483648 },
            { name: "b", size: 1 },
          ],
        })
      ).status,
    ).toBe(400);
    const blocked = await mf.dispatchFetch("http://api.test/transfers", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
    });
    expect(blocked.status).toBe(403);
    const s = await create();
    expect(
      (await request(`/transfers/${s.id}/complete`, "POST", undefined, s.token))
        .status,
    ).toBe(409);
  });
  it("uploads multipart bytes directly through the local R2 S3 service and checks integrity", async () => {
    const bytes = Buffer.alloc(8 * 1024 ** 2 + 37, 0x5a);
    const r = await request(
      "/transfers",
      "POST",
      { files: [{ name: "binary.dat", size: bytes.length }] },
      undefined,
      "192.0.2.55",
    );
    expect(r.status).toBe(201);
    const session = (await r.json()) as {
      id: string;
      token: string;
      files: { id: string }[];
    };
    const root = `/transfers/${session.id}`,
      file = `${root}/files/${session.files[0].id}`;
    expect(
      (await request(`${file}/start`, "POST", undefined, session.token)).status,
    ).toBe(200);
    const parts: { partNumber: number; etag: string }[] = [];
    for (let part = 1; part <= 2; part++) {
      const chunk = bytes.subarray(
          (part - 1) * 8 * 1024 ** 2,
          part * 8 * 1024 ** 2,
        ),
        md5 = createHash("md5").update(chunk).digest("base64");
      const signed = await request(
        `${file}/part`,
        "POST",
        { part, md5 },
        session.token,
      );
      expect(signed.status).toBe(200);
      const { url } = (await signed.json()) as { url: string };
      if (part === 2) {
        const oversized = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-MD5": md5,
            "Content-Length": String(chunk.length + 1),
          },
          body: Buffer.alloc(chunk.length + 1),
        });
        expect(oversized.status).toBe(403);
      }
      const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-MD5": md5, "Content-Length": String(chunk.length) },
        body: chunk,
      });
      expect(put.status, await put.text()).toBe(200);
      parts.push({ partNumber: part, etag: put.headers.get("etag")! });
    }
    const finished = await request(
      `${file}/finish`,
      "POST",
      { parts },
      session.token,
    );
    expect(finished.status, JSON.stringify(await finished.json())).toBe(200);
    expect(
      (await request(`${root}/complete`, "POST", undefined, session.token))
        .status,
    ).toBe(200);
    const signed = await request(`${file}/download`, "POST");
    const { url } = (await signed.json()) as { url: string };
    const content = await mf.dispatchFetch(url);
    expect(
      createHash("sha256")
        .update(new Uint8Array(await content.arrayBuffer()))
        .digest("hex"),
    ).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
  it("cancels uploads and retries cleanup without retaining file objects", async () => {
    const s = await create(),
      root = `/transfers/${s.id}`;
    await request(
      `${root}/files/${s.files[0].id}/start`,
      "POST",
      undefined,
      s.token,
    );
    expect((await request(root, "DELETE", undefined, s.token)).status).toBe(
      200,
    );
    expect(
      (await request(`${root}/complete`, "POST", undefined, s.token)).status,
    ).toBe(410);
    const scheduled = await mf.dispatchFetch(
      "http://api.test/cdn-cgi/local/scheduled",
    );
    expect(scheduled.status).toBe(200);
    expect(
      await (
        await mf.getD1Database("DB")
      )
        .prepare("SELECT id FROM transfers WHERE id=?")
        .bind(s.id)
        .first(),
    ).toBe(null);
    expect(
      await (await mf.getR2Bucket("BUCKET")).head(`${s.id}/${s.files[0].id}`),
    ).toBe(null);
    expect(
      (await mf.dispatchFetch("http://api.test/cdn-cgi/local/scheduled"))
        .status,
    ).toBe(200);
  });
  it("reserves quotas atomically under concurrency", async () => {
    const db = await mf.getD1Database("DB");
    const now = Date.now(),
      key = id();
    const writes = Array.from({ length: 12 }, () =>
      db.batch([
        ...quotaStatements(db, key, Math.floor(now / 86400000), 1),
        db
          .prepare("INSERT INTO transfers VALUES (?,?,?,?,?,?,'pending',?,?,?)")
          .bind(
            id(),
            "owner",
            null,
            now,
            now + 1000,
            now + 1000,
            1,
            key,
            Math.floor(now / 86400000),
          ),
      ]),
    );
    const results = await Promise.allSettled(writes);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(
      (
        await db
          .prepare("SELECT count FROM admission_quotas WHERE key=?")
          .bind(key)
          .first<{ count: number }>()
      )?.count,
    ).toBe(10);
  });
});

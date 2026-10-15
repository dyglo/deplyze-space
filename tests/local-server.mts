import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const built = await build({
  entryPoints: ["worker/src/index.ts"],
  bundle: true,
  write: false,
  alias: { "@aws-sdk/xml-builder": "@aws-sdk/xml-builder/dist-cjs/index.js" },
  format: "esm",
  platform: "browser",
  mainFields: ["browser", "module", "main"],
  conditions: ["workerd", "browser"],
  external: ["node:*"],
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    port: 8787,
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
      R2_ENDPOINT: "http://127.0.0.1:8787/cdn-cgi/local/r2/s3",
      SIGNING_SECRET: "test-local-only",
      R2_ACCESS_KEY_ID: "test",
      R2_SECRET_ACCESS_KEY: "test",
      R2_ACCOUNT_ID: "test",
      R2_BUCKET: "test",
      ALLOWED_ORIGINS: "http://localhost:3000",
      SHARE_ORIGIN: "http://localhost:3000",
      UPLOADS_ENABLED: "true",
    },
  }),
);
const db = await mf.getD1Database("DB"),
  sql = await readFile("worker/migrations/0001_transfers.sql", "utf8");
for (const statement of sql.split(";").filter((s) => s.trim()))
  await db.prepare(statement).run();
console.log("Local D1 + R2 ready on 8787 (test credentials only)");
process.on("SIGTERM", async () => {
  await mf.dispose();
  process.exit(0);
});

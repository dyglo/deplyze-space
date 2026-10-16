import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "jsonc-parser";

const config = parse(await readFile("worker/wrangler.jsonc", "utf8"));
const api = "https://deplyze-space-staging.deplyze-space-b6683d42.workers.dev";
const storage = `https://${config.vars.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${config.vars.R2_BUCKET}/cors-probe`;
const allowed = config.vars.ALLOWED_ORIGINS.split(",");
for (const origin of [...allowed, "https://untrusted.example"]) {
  for (const [url, method, headers] of [
    [`${api}/transfers`, "POST", "authorization,content-type"],
    [storage, "PUT", "content-md5,content-type"],
  ]) {
    const response = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": headers,
      },
      signal: AbortSignal.timeout(30000),
    });
    if (allowed.includes(origin)) {
      assert.ok(response.ok, `${origin} ${method}: ${response.status}`);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
    } else {
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    console.log(
      `${allowed.includes(origin) ? "Allowed" : "Rejected"}: ${origin} → ${method} ${new URL(url).hostname}`,
    );
  }
}
console.log(
  "Deployed Worker and R2 preflights match; arbitrary origins rejected.",
);

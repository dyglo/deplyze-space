import { parse } from "jsonc-parser";
import { readFile } from "node:fs/promises";
const errors = [];
const config = parse(await readFile("worker/wrangler.jsonc", "utf8"), errors, {
  allowTrailingComma: true,
});
if (errors.length) throw new Error("Invalid Wrangler configuration");
if (
  config.name !== "deplyze-space-staging" ||
  config.vars.R2_BUCKET !== "deplyze-space-staging"
)
  throw new Error("Unexpected staging target");
if (
  config.account_id !== "b6683d42632a146d7b07fad1a528a8cb" ||
  config.vars.R2_ACCOUNT_ID !== config.account_id
)
  throw new Error("Unexpected Cloudflare account");
if (config.routes?.length)
  throw new Error("Staging deployment must not change domain routes");
if (
  !config.d1_databases?.[0]?.database_id ||
  /^0{8}-/.test(config.d1_databases[0].database_id)
)
  throw new Error("Record the provisioned staging D1 ID before deploying");
const origins = config.vars.ALLOWED_ORIGINS.split(",");
for (const origin of [...origins, config.vars.SHARE_ORIGIN]) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    url.hostname === "localhost" ||
    origin.includes("*")
  )
    throw new Error("Set exact HTTPS staging origins before deploying");
}
if (!origins.includes(config.vars.SHARE_ORIGIN))
  throw new Error("Share origin must be an allowed frontend origin");
if (config.vars.R2_ENDPOINT)
  throw new Error("Remove the local R2 endpoint override before deploying");
console.log("Staging target verified; no production routes configured.");

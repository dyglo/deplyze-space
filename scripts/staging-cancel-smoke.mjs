import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const api = "https://deplyze-space-staging.deplyze-space-b6683d42.workers.dev";
async function call(path, body, token, method = "POST") {
  const response = await fetch(api + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}
// Exercise the accepted 2 GiB declaration without claiming a full 2 GiB upload.
const s = await call("/transfers", {
  files: [{ name: "cancelled-multipart.dat", size: 2 * 1024 ** 3 }],
});
const root = `/transfers/${s.id}`,
  file = `${root}/files/${s.files[0].id}`;
await call(`${file}/start`, undefined, s.token);
const bytes = Buffer.alloc(8 * 1024 ** 2, 0x6b);
const md5 = createHash("md5").update(bytes).digest("base64");
const { url } = await call(`${file}/part`, { part: 1, md5 }, s.token);
const oversized = await fetch(url, {
  method: "PUT",
  headers: { "Content-MD5": md5 },
  body: Buffer.alloc(bytes.length + 1),
});
assert.equal(
  oversized.status,
  403,
  "Hosted R2 must enforce the signed part length",
);
const corrupt = await fetch(url, {
  method: "PUT",
  headers: { "Content-MD5": md5 },
  body: Buffer.alloc(bytes.length),
});
assert.equal(
  corrupt.status,
  400,
  "Hosted R2 must reject bytes that do not match MD5",
);
const uploaded = await fetch(url, {
  method: "PUT",
  headers: { "Content-MD5": md5 },
  body: bytes,
});
assert.equal(uploaded.status, 200);
await call(root, undefined, s.token, "DELETE");
assert.equal((await fetch(api + root)).status, 410);
assert.equal(
  (
    await fetch(api + `${root}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.token}` },
    })
  ).status,
  410,
);
await mkdir(".artifacts", { recursive: true });
await writeFile(
  ".artifacts/cancellation-result.json",
  JSON.stringify(
    {
      transferId: s.id,
      declaredBytes: 2 * 1024 ** 3,
      bytesUploaded: bytes.length,
      oversizedPart: oversized.status,
      corruptPart: corrupt.status,
      cancelled: true,
      accessAfterCancellation: 410,
    },
    null,
    2,
  ),
);
console.log({
  transferId: s.id,
  oversizedPart: oversized.status,
  corruptPart: corrupt.status,
  cancelled: true,
  accessAfterCancellation: 410,
});

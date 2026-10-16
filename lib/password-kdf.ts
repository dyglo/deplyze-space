import { createHash, pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const derive = promisify(pbkdf2);
const schema = z.object({
  password: z.string().min(1).max(128),
  salt: z.string().regex(/^[a-f0-9]{32}$/),
});
const digest = (value: string) => createHash("sha256").update(value).digest();
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });

export async function derivePasswordRequest(
  request: Request,
  secret: string | undefined,
) {
  // Authenticate before parsing input or spending CPU. No CORS access is offered.
  if (!secret) return json({ error: "Service unavailable" }, 503);
  if (
    request.headers.has("Origin") ||
    !timingSafeEqual(
      digest(request.headers.get("Authorization") || ""),
      digest(`Bearer ${secret}`),
    )
  )
    return json({ error: "Unauthorized" }, 401);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Invalid request" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      return json({ error: "Request too large" }, 413);
    }
    chunks.push(value);
  }
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const hash = await derive(input.password, input.salt, 600000, 32, "sha256");
  return json({ hash: hash.toString("hex") });
}

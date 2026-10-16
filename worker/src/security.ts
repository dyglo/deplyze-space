import { z } from "zod";
import { pbkdf2Sync } from "node:crypto";
export const MAX_BYTES = 2 * 1024 ** 3;
export const PART_BYTES = 8 * 1024 ** 2;
export const transferSchema = z
  .object({
    files: z
      .array(
        z.object({
          name: z
            .string()
            .min(1)
            .max(240)
            .refine(
              (s) => !/[\x00-\x1f\x7f/\\]/.test(s) && s !== "." && s !== "..",
              "Invalid filename",
            ),
          size: z.number().int().min(0).max(MAX_BYTES),
        }),
      )
      .min(1)
      .max(50),
    days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
    password: z.string().min(12).max(128).optional(),
  })
  .refine(
    (v) => v.files.reduce((n, f) => n + f.size, 0) <= MAX_BYTES,
    "Transfer exceeds 2 GB",
  );
export const id = () => crypto.randomUUID().replaceAll("-", "");
export const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (n) => n.toString(16).padStart(2, "0")).join(
    "",
  );
export const hash = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function mac(secret: string, value: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value)),
  );
}
type PasswordService = {
  PASSWORD_KDF_URL?: string;
  PASSWORD_KDF_SECRET?: string;
};
export async function passwordHash(
  password: string,
  salt = id(),
  service?: PasswordService,
) {
  if (service?.PASSWORD_KDF_URL) {
    if (
      !service.PASSWORD_KDF_SECRET ||
      new URL(service.PASSWORD_KDF_URL).protocol !== "https:"
    )
      throw new Error("Password service is not configured");
    const response = await fetch(service.PASSWORD_KDF_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${service.PASSWORD_KDF_SECRET}`,
      },
      body: JSON.stringify({ password, salt }),
      // Workers supports manual/follow only. Refuse 3xx below so the service
      // credential can never be forwarded to a redirect destination.
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Password service unavailable");
    const value = (await response.json()) as { hash?: unknown };
    if (typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash))
      throw new Error("Invalid password service response");
    return `${salt}:${value.hash}`;
  }
  return `${salt}:${pbkdf2Sync(password, salt, 600000, 32, "sha256").toString("hex")}`;
}
export async function passwordMatches(
  password: string,
  stored: string,
  service?: PasswordService,
) {
  return equal(
    await passwordHash(password, stored.split(":")[0], service),
    stored,
  );
}
export function active(
  t: { status: string; expires_at: number },
  now = Date.now(),
) {
  return t.status === "ready" && t.expires_at > now;
}
export function disposition(name: string) {
  return `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`;
}

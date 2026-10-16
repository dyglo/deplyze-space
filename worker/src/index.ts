import { quotaStatements } from "./admission";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import {
  active,
  disposition,
  equal,
  hash,
  id,
  mac,
  PART_BYTES,
  passwordHash,
  passwordMatches,
  transferSchema,
} from "./security";
type Transfer = {
  id: string;
  owner_hash: string;
  password_hash: string | null;
  created_at: number;
  expires_at: number;
  upload_expires_at: number;
  status: string;
  total_size: number;
};
type FileRow = {
  id: string;
  transfer_id: string;
  name: string;
  size: number;
  object_key: string;
  upload_id: string | null;
  complete: number;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
function s3(env: Env) {
  const endpoint =
    env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 65536) {
      await reader.cancel();
      return fail(413, "Request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return fail(400, "Invalid JSON");
  }
}
async function rate(env: Env, key: string, limit: number, seconds = 60) {
  const now = Date.now();
  const bucket = Math.floor(now / (seconds * 1000));
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(`${key}:${bucket}`, now + seconds * 1000)
    .first<{ count: number }>();
  if (!row || row.count > limit)
    fail(429, "Too many requests. Try again later.");
}
async function transfer(env: Env, id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return fail(404, "Transfer not found");
  return (
    (await env.DB.prepare("SELECT * FROM transfers WHERE id=?")
      .bind(id)
      .first<Transfer>()) ?? fail(404, "Transfer not found")
  );
}
async function files(env: Env, id: string) {
  return (
    await env.DB.prepare("SELECT * FROM files WHERE transfer_id=? ORDER BY id")
      .bind(id)
      .all<FileRow>()
  ).results;
}
async function owner(req: Request, t: Transfer) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || !equal(await hash(token), t.owner_hash))
    fail(403, "Invalid upload session");
  if (t.status !== "pending" || t.upload_expires_at <= Date.now())
    fail(410, "Upload session ended");
}
async function access(req: Request, env: Env, t: Transfer) {
  if (!active(t)) fail(410, "This transfer is unavailable or expired");
  if (t.password_hash) {
    const token =
      req.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
    const [expiry, signature] = token.split(".");
    if (
      !/^\d+$/.test(expiry) ||
      Number(expiry) <= Date.now() ||
      Number(expiry) > Date.now() + 3600000 ||
      !equal(
        signature || "",
        await mac(env.SIGNING_SECRET, `${t.id}:${expiry}`),
      )
    )
      fail(401, "Password required");
  }
}
async function cleanup(env: Env) {
  const now = Date.now();
  const rows = (
    await env.DB.prepare(
      "SELECT * FROM transfers WHERE status='deleting' OR expires_at<=? OR (status='pending' AND upload_expires_at<=?) LIMIT 40",
    )
      .bind(now, now)
      .all<Transfer>()
  ).results;
  let failures = 0;
  for (const t of rows) {
    try {
      await env.DB.prepare("UPDATE transfers SET status='deleting' WHERE id=?")
        .bind(t.id)
        .run();
      for (const f of await files(env, t.id)) {
        if (f.upload_id) {
          try {
            await s3(env).send(
              new AbortMultipartUploadCommand({
                Bucket: env.R2_BUCKET,
                Key: f.object_key,
                UploadId: f.upload_id,
              }),
            );
          } catch (e) {
            if (!(e instanceof Error) || e.name !== "NoSuchUpload") throw e;
          }
        }
        await env.BUCKET.delete(f.object_key);
      }
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE storage_budget SET bytes=bytes-(SELECT COALESCE(SUM(total_size),0) FROM transfers WHERE id=?) WHERE id=1",
        ).bind(t.id),
        env.DB.prepare("DELETE FROM transfers WHERE id=?").bind(t.id),
      ]);
    } catch {
      failures++;
    }
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate_limits WHERE until_at<?").bind(now),
    env.DB.prepare("DELETE FROM admission_quotas WHERE day<?").bind(
      Math.floor(now / 86400000) - 2,
    ),
  ]);
  console.log(
    JSON.stringify({ event: "cleanup", processed: rows.length, failures }),
  );
}
async function route(req: Request, env: Env) {
  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && url.pathname === "/health") {
    await env.DB.prepare("SELECT 1").first();
    return json({
      status: "ok",
      uploadsEnabled: String(env.UPLOADS_ENABLED) === "true",
    });
  }
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const identity = await mac(env.SIGNING_SECRET, ip);
  await rate(env, `request:${identity}`, 1200);
  if (req.method === "POST" && url.pathname === "/transfers") {
    if (
      String(env.UPLOADS_ENABLED) !== "true" ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY
    )
      fail(503, "Uploads are not configured yet");
    await rate(env, `create:${identity}`, 5, 3600);
    const data = transferSchema.parse(await body(req));
    const tid = id(),
      token = id() + id(),
      now = Date.now();
    const total = data.files.reduce((n, f) => n + f.size, 0);
    const expiry = now + data.days * 86400000;
    const rows = data.files.map((f) => ({ id: id(), ...f }));
    try {
      await env.DB.batch([
        ...quotaStatements(env.DB, identity, Math.floor(now / 86400000), total),
        env.DB.prepare(
          "INSERT INTO transfers VALUES (?,?,?,?,?,?,'pending',?,?,?)",
        ).bind(
          tid,
          await hash(token),
          data.password ? await passwordHash(data.password, undefined, env) : null,
          now,
          expiry,
          now + 86400000,
          total,
          identity,
          Math.floor(now / 86400000),
        ),
        ...rows.map((f) =>
          env.DB.prepare(
            "INSERT INTO files(id,transfer_id,name,size,object_key) VALUES (?,?,?,?,?)",
          ).bind(f.id, tid, f.name, f.size, `${tid}/${f.id}`),
        ),
      ]);
    } catch (e) {
      if (String(e).includes("quota_exceeded"))
        return fail(429, "Upload quota reached. Try another day.");
      throw e;
    }
    return json(
      {
        id: tid,
        token,
        expiresAt: expiry,
        uploadExpiresAt: now + 86400000,
        files: rows,
        partSize: PART_BYTES,
      },
      201,
    );
  }
  if (path[0] !== "transfers" || !path[1]) return fail(404, "Not found");
  const t = await transfer(env, path[1]);
  if (req.method === "POST" && path[2] === "unlock") {
    await rate(env, `password:${identity}`, 5, 900);
    if (!active(t)) fail(410, "This transfer is unavailable or expired");
    const { password } = z
      .object({ password: z.string().max(128) })
      .parse(await body(req));
    if (t.password_hash && !(await passwordMatches(password, t.password_hash, env)))
      fail(401, "Incorrect password");
    const expiry = String(Math.min(Date.now() + 3600000, t.expires_at));
    return json({
      token: `${expiry}.${await mac(env.SIGNING_SECRET, `${t.id}:${expiry}`)}`,
    });
  }
  if (req.method === "GET" && path.length === 2) {
    await access(req, env, t);
    return json({
      id: t.id,
      expiresAt: t.expires_at,
      totalSize: t.total_size,
      files: (await files(env, t.id)).map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
      })),
    });
  }
  if (req.method === "DELETE" && path.length === 2) {
    await owner(req, t);
    await env.DB.prepare("UPDATE transfers SET status='deleting' WHERE id=?")
      .bind(t.id)
      .run();
    return json({ cancelled: true });
  }
  if (req.method === "POST" && path[2] === "resume") {
    const token =
      req.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
    if (!equal(await hash(token), t.owner_hash))
      fail(403, "Invalid upload session");
    const settings = z
      .object({
        days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
        password: z.string().max(128).optional(),
      })
      .parse(await body(req));
    const samePassword = t.password_hash
      ? !!settings.password &&
        (await passwordMatches(settings.password, t.password_hash, env))
      : !settings.password;
    if (
      t.expires_at - t.created_at !== settings.days * 86400000 ||
      !samePassword
    )
      fail(
        409,
        "Use the original expiration and password to resume, or start over.",
      );
    if (active(t))
      return json({
        complete: true,
        url: `${env.SHARE_ORIGIN}/s/${t.id}`,
        expiresAt: t.expires_at,
      });
    await owner(req, t);
    return json({ complete: false });
  }
  if (req.method === "POST" && path[2] === "complete") {
    if (t.status === "ready") {
      const token =
        req.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
      if (!equal(await hash(token), t.owner_hash))
        fail(403, "Invalid upload session");
      if (!active(t)) fail(410, "Transfer expired");
      return json({
        url: `${env.SHARE_ORIGIN}/s/${t.id}`,
        expiresAt: t.expires_at,
      });
    }
    await owner(req, t);
    const list = await files(env, t.id);
    if (!list.every((f) => f.complete)) fail(409, "Files are not complete");
    for (const f of list) {
      const obj = await env.BUCKET.head(f.object_key);
      if (!obj || obj.size !== f.size) fail(409, "File verification failed");
    }
    const result = await env.DB.prepare(
      "UPDATE transfers SET status='ready' WHERE id=? AND status='pending' AND upload_expires_at>?",
    )
      .bind(t.id, Date.now())
      .run();
    if (!result.meta.changes) fail(409, "Upload session ended");
    return json({
      url: `${env.SHARE_ORIGIN}/s/${t.id}`,
      expiresAt: t.expires_at,
    });
  }
  if (path[2] !== "files" || !path[3]) return fail(404, "Not found");
  const f =
    (await env.DB.prepare("SELECT * FROM files WHERE id=? AND transfer_id=?")
      .bind(path[3], t.id)
      .first<FileRow>()) ?? fail(404, "File not found");
  if (req.method === "POST" && path[4] === "download") {
    await access(req, env, t);
    await rate(env, `download:${identity}`, 60);
    const expiry = String(Math.min(Date.now() + 60000, t.expires_at));
    const sig = await mac(env.SIGNING_SECRET, `${t.id}:${f.id}:${expiry}`);
    return json({
      url: `${url.origin}/transfers/${t.id}/files/${f.id}/content?expires=${expiry}&signature=${sig}`,
    });
  }
  if (req.method === "GET" && path[4] === "content") {
    if (!active(t)) fail(410, "This transfer is unavailable or expired");
    const exp = url.searchParams.get("expires") || "",
      sig = url.searchParams.get("signature") || "";
    if (
      !/^\d+$/.test(exp) ||
      Number(exp) <= Date.now() ||
      Number(exp) > Date.now() + 60000 ||
      !equal(sig, await mac(env.SIGNING_SECRET, `${t.id}:${f.id}:${exp}`))
    )
      fail(403, "Download authorization expired");
    await rate(env, `content:${identity}`, 60);
    const object = await env.BUCKET.get(f.object_key);
    if (!object) return fail(410, "File no longer available");
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": disposition(f.name),
        "Content-Length": String(object.size),
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  }
  await owner(req, t);
  if (req.method === "POST" && path[4] === "start") {
    if (f.complete) return json({ complete: true });
    const existing = await env.BUCKET.head(f.object_key);
    if (existing && existing.size === f.size) {
      await env.DB.prepare("UPDATE files SET complete=1 WHERE id=?")
        .bind(f.id)
        .run();
      return json({ complete: true });
    }
    if (f.size === 0) {
      await env.BUCKET.put(f.object_key, new Uint8Array(0), {
        httpMetadata: { contentType: "application/octet-stream" },
      });
      await env.DB.prepare("UPDATE files SET complete=1 WHERE id=?")
        .bind(f.id)
        .run();
      return json({ complete: true });
    }
    if (!f.upload_id) {
      const upload = await s3(env).send(
        new CreateMultipartUploadCommand({
          Bucket: env.R2_BUCKET,
          Key: f.object_key,
          ContentType: "application/octet-stream",
        }),
      );
      if (!upload.UploadId) throw new Error("Multipart initiation failed");
      const update = await env.DB.prepare(
        "UPDATE files SET upload_id=? WHERE id=? AND upload_id IS NULL",
      )
        .bind(upload.UploadId, f.id)
        .run();
      if (!update.meta.changes) {
        await s3(env).send(
          new AbortMultipartUploadCommand({
            Bucket: env.R2_BUCKET,
            Key: f.object_key,
            UploadId: upload.UploadId,
          }),
        );
      }
    }
    return json({ complete: false });
  }
  if (!f.upload_id) return fail(409, "Start the file upload first");
  const input = {
    Bucket: env.R2_BUCKET,
    Key: f.object_key,
    UploadId: f.upload_id,
  };
  if (req.method === "POST" && path[4] === "part") {
    const data = z
      .object({
        part: z
          .number()
          .int()
          .min(1)
          .max(Math.ceil(f.size / PART_BYTES)),
        md5: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
      })
      .parse(await body(req));
    const size = Math.min(PART_BYTES, f.size - (data.part - 1) * PART_BYTES);
    const signed = await getSignedUrl(
      s3(env),
      new UploadPartCommand({
        ...input,
        PartNumber: data.part,
        ContentLength: size,
        ContentMD5: data.md5,
      }),
      {
        expiresIn: 120,
        signableHeaders: new Set(["content-length", "content-md5"]),
        unhoistableHeaders: new Set(["content-md5"]),
      },
    );
    return json({ url: signed });
  }
  if (req.method === "POST" && path[4] === "finish") {
    const { parts } = z
      .object({
        parts: z
          .array(
            z.object({
              partNumber: z.number().int().positive(),
              etag: z
                .string()
                .min(1)
                .max(256)
                .refine((s) => !/[\x00-\x1f\x7f<>]/.test(s)),
            }),
          )
          .length(Math.ceil(f.size / PART_BYTES)),
      })
      .parse(await body(req));
    if (parts.some((p, i) => p.partNumber !== i + 1))
      fail(400, "Invalid part order");
    // R2 validates every ETag. Signed Content-Length bounds each part; HEAD verifies the completed object.
    await s3(env).send(
      new CompleteMultipartUploadCommand({
        ...input,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
    const obj = await env.BUCKET.head(f.object_key);
    if (!obj || obj.size !== f.size) fail(409, "File verification failed");
    await env.DB.prepare("UPDATE files SET complete=1 WHERE id=?")
      .bind(f.id)
      .run();
    return json({ complete: true });
  }
  return fail(404, "Not found");
}
export default {
  async fetch(req, env): Promise<Response> {
    const origin = req.headers.get("Origin");
    const allowed = env.ALLOWED_ORIGINS.split(",").includes(origin || "");
    let response: Response;
    try {
      if (origin && !allowed) fail(403, "Origin not allowed");
      if (req.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else response = await route(req, env);
    } catch (e) {
      if (e instanceof HttpError)
        response = json({ error: e.message }, e.status);
      else if (e instanceof z.ZodError)
        response = json(
          { error: "Invalid request", details: e.issues.map((i) => i.message) },
          400,
        );
      else {
        console.error(
          JSON.stringify({
            event: "request_failed",
            requestId: crypto.randomUUID(),
            kind: e instanceof Error ? e.name : "unknown",
          }),
        );
        response = json({ error: "Service unavailable. Please retry." }, 503);
      }
    }
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Strict-Transport-Security": "max-age=31536000",
      Vary: "Origin",
    }))
      headers.set(k, v);
    if (allowed && origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
      headers.set("Access-Control-Max-Age", "600");
    }
    if (response.status === 429) headers.set("Retry-After", "60");
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;

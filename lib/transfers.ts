import { createSHA256, md5 } from "hash-wasm";
export const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8787" : "");
export type SharedFile = { id: string; name: string; size: number };
export type SharedTransfer = {
  id: string;
  expiresAt: number;
  totalSize: number;
  files: SharedFile[];
};
type Session = {
  id: string;
  token: string;
  expiresAt: number;
  uploadExpiresAt: number;
  files: SharedFile[];
  partSize: number;
  fingerprints: string[];
};
const KEY = "deplyze-upload-session-v1";
export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  if (!API)
    throw new Error(
      "File transfers are not configured yet. Please try again later.",
    );
  const timeout = AbortSignal.timeout(30000);
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(
      timeout.aborted
        ? "The transfer service took too long to respond. Retry the transfer."
        : "Could not reach the transfer service. Check your connection and retry.",
    );
  }
  let data: T & { error?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The transfer service is temporarily unavailable. Please retry.",
    );
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: response.status,
    });
  return data;
}
async function fingerprint(file: File, signal: AbortSignal) {
  const h = await createSHA256();
  h.init();
  for (let offset = 0; offset < file.size; offset += 8 * 1024 ** 2) {
    signal.throwIfAborted();
    h.update(
      new Uint8Array(
        await file.slice(offset, offset + 8 * 1024 ** 2).arrayBuffer(),
      ),
    );
  }
  return h.digest("hex");
}
function put(
  url: string,
  data: Blob,
  checksum: string,
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = 120000;
    xhr.setRequestHeader("Content-MD5", checksum);
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    const done = () => signal.removeEventListener("abort", abort);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      done();
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag") || "")
        : reject(new Error("Part upload failed. Retry the transfer."));
    };
    xhr.onerror = () => {
      done();
      reject(new Error("Connection interrupted. Retry the transfer."));
    };
    xhr.ontimeout = () => {
      done();
      reject(new Error("Storage upload timed out. Retry the transfer."));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException("Upload paused", "AbortError"));
    };
    if (signal.aborted) {
      done();
      reject(new DOMException("Upload paused", "AbortError"));
      return;
    }
    xhr.send(data);
  });
}
export async function upload(
  files: File[],
  days: number,
  password: string,
  signal: AbortSignal,
  onProgress: (n: number) => void,
): Promise<{ url: string; expiresAt: number }> {
  const fingerprints = [];
  for (const f of files) fingerprints.push(await fingerprint(f, signal));
  let session: Session | undefined;
  try {
    const stored = JSON.parse(
      localStorage.getItem(KEY) || "null",
    ) as Session | null;
    if (
      stored &&
      stored.uploadExpiresAt > Date.now() &&
      JSON.stringify(stored.fingerprints) === JSON.stringify(fingerprints) &&
      stored.files.every(
        (f, i) => f.name === files[i]?.name && f.size === files[i]?.size,
      )
    )
      session = stored;
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  if (!session) {
    session = await api<Session>("/transfers", {
      method: "POST",
      signal,
      body: JSON.stringify({
        files: files.map((f) => ({ name: f.name, size: f.size })),
        days,
        password: password || undefined,
      }),
    });
    session.fingerprints = fingerprints;
    try {
      localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* Retry remains available in this tab. */
    }
  }
  const token = session.token;
  const root = `/transfers/${session.id}`;
  let uploaded = 0;
  const total = files.reduce((n, f) => n + f.size, 0);
  const recovered = await api<{
    complete: boolean;
    url: string;
    expiresAt: number;
  }>(
    `${root}/resume`,
    {
      method: "POST",
      signal,
      body: JSON.stringify({ days, password: password || undefined }),
    },
    token,
  );
  if (recovered.complete) {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    onProgress(100);
    return recovered;
  }
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `${root}/files/${session.files[i].id}`;
    const started = await api<{ complete: boolean }>(
      `${path}/start`,
      { method: "POST", signal },
      token,
    );
    if (!started.complete) {
      const parts: { partNumber: number; etag: string }[] = [];
      for (
        let offset = 0, part = 1;
        offset < file.size;
        offset += session.partSize, part++
      ) {
        signal.throwIfAborted();
        const chunk = file.slice(offset, offset + session.partSize);
        const checksumHex = await md5(
          new Uint8Array(await chunk.arrayBuffer()),
        );
        const checksum = btoa(
          String.fromCharCode(
            ...checksumHex.match(/../g)!.map((x) => parseInt(x, 16)),
          ),
        );
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const signed = await api<{ url: string }>(
              `${path}/part`,
              {
                method: "POST",
                signal,
                body: JSON.stringify({ part, md5: checksum }),
              },
              token,
            );
            const etag = await put(signed.url, chunk, checksum, signal, (n) =>
              onProgress(
                Math.min(
                  99,
                  Math.round(((uploaded + n) / Math.max(1, total)) * 100),
                ),
              ),
            );
            if (!etag)
              throw new Error(
                "Storage did not return a part receipt. Please retry.",
              );
            parts.push({ partNumber: part, etag });
            lastError = undefined;
            break;
          } catch (e) {
            lastError = e;
            if (signal.aborted) throw e;
          }
        }
        if (lastError) throw lastError;
        uploaded += chunk.size;
      }
      await api(
        `${path}/finish`,
        { method: "POST", signal, body: JSON.stringify({ parts }) },
        token,
      );
    } else uploaded += file.size;
    onProgress(Math.min(99, Math.round((uploaded / Math.max(1, total)) * 100)));
  }
  const result = await api<{ url: string; expiresAt: number }>(
    `${root}/complete`,
    { method: "POST", signal },
    token,
  );
  try {
    localStorage.removeItem(KEY);
  } catch {}
  onProgress(100);
  return result;
}
export async function cancelUpload() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Session | null;
    if (s) await api(`/transfers/${s.id}`, { method: "DELETE" }, s.token);
    if (JSON.parse(localStorage.getItem(KEY) || "null")?.id === s?.id)
      localStorage.removeItem(KEY);
  } catch {
    /* Server expiry and Cron remain the fallback. */
  }
}

"use client";
import { useEffect, useState } from "react";
import { api, type SharedTransfer } from "@/lib/transfers";
export default function Download({ id }: { id: string }) {
  const [transfer, setTransfer] = useState<SharedTransfer | null>(null),
    [error, setError] = useState(""),
    [locked, setLocked] = useState(false),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<SharedTransfer>(
      `/transfers/${id}`,
      { signal: controller.signal },
      token,
    )
      .then((t) => {
        setTransfer(t);
        setError("");
        setLocked(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          if (e.status === 401) setLocked(true);
          else setError(e.message);
        }
      });
    return () => controller.abort();
  }, [id, token]);
  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ token: string }>(`/transfers/${id}/unlock`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setToken(result.token);
      setPassword("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to unlock");
    } finally {
      setBusy(false);
    }
  };
  const download = async (file: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(
        `/transfers/${id}/files/${file}/download`,
        { method: "POST" },
        token,
      );
      const a = document.createElement("a");
      a.href = result.url;
      a.rel = "noreferrer";
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="site-shell">
      <header className="top-nav">
        <a className="nav-label" href="/">
          Home
        </a>
        <a className="wordmark" href="/">
          Deplyze Space
        </a>
        <span />
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Private file sharing</p>
          <h1>
            Your <em>files.</em>
          </h1>
          <p className="hero-subtext">No ads. Just work done.</p>
        </div>
        <div className="experience-wrap">
          <div className="share-card">
            {locked ? (
              <form onSubmit={unlock}>
                <label>
                  Password
                  <input
                    className="password-input"
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="share-primary" disabled={busy}>
                  Unlock transfer
                </button>
              </form>
            ) : transfer ? (
              <>
                <p className="expiry-note">
                  {transfer.files.length} files ·{" "}
                  {(transfer.totalSize / 1024 ** 2).toFixed(2)} MB · Expires{" "}
                  {new Date(transfer.expiresAt).toLocaleString()}
                </p>
                <ul className="transfer-files">
                  {transfer.files.map((f) => (
                    <li key={f.id}>
                      <span>
                        {f.name} · {(f.size / 1024 ** 2).toFixed(2)} MB
                      </span>
                      <button
                        className="text-action"
                        disabled={busy}
                        onClick={() => download(f.id)}
                      >
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="expiry-note">
                  Download files individually. Only open files from people you
                  trust.
                </p>
              </>
            ) : !error ? (
              <p role="status">Loading transfer…</p>
            ) : null}
            <p className="transfer-error" role="alert">
              {error}
            </p>
          </div>
        </div>
      </section>
      <footer className="bottom-nav">
        <a href="/">Send your own files</a>
        <a href="/privacy">Privacy & abuse reporting</a>
      </footer>
    </main>
  );
}

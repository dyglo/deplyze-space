"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Download,
  FileUp,
  RotateCcw,
  Share2,
  LoaderCircle,
  Sun,
  Moon,
} from "lucide-react";

import { upload, cancelUpload } from "@/lib/transfers";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadMark() {
  return (
    <div className="upload-mark" aria-hidden="true">
      <FileUp strokeWidth={1} />
    </div>
  );
}

function QRCodePanel({
  isLight,
  shareUrl,
}: {
  isLight: boolean;
  shareUrl: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, shareUrl, {
      width: 156,
      margin: 2,
      color: {
        dark: isLight ? "#171715" : "#f3efe5",
        light: isLight ? "#f4f0e7" : "#11100b",
      },
      errorCorrectionLevel: "M",
    });
  }, [isLight, shareUrl]);

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = "deplyze-space-qr.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <motion.div
      className="qr-panel"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="qr-frame">
        <canvas ref={canvasRef} aria-label="QR code for the shared file" />
      </div>
      <button className="text-action" onClick={downloadQR} type="button">
        <Download data-icon="inline-start" /> Download QR
      </button>
    </motion.div>
  );
}

export default function Page() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];
  const [shareUrl, setShareUrl] = useState("");
  const [days, setDays] = useState(7);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (
      !file ||
      !(file.type.startsWith("image/") || file.type.startsWith("video/"))
    ) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => controller.current?.abort(), []);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  }, [isLight]);

  const beginUpload = useCallback((selected?: FileList | null) => {
    if (!selected?.length) return;
    const next = Array.from(selected);
    if (
      next.length > 50 ||
      next.reduce((n, f) => n + f.size, 0) > 2 * 1024 ** 3
    ) {
      setError("Choose up to 50 files, totaling at most 2 GB.");
      return;
    }
    setFiles(next);
    setProgress(0);
    setCopied(false);
    setError("");
  }, []);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    beginUpload(event.dataTransfer.files);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setError("Copy failed. Select the link to copy it.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const createShare = async () => {
    setIsCreating(true);
    setError("");
    controller.current = new AbortController();
    try {
      const result = await upload(
        files,
        days,
        password,
        controller.current.signal,
        setProgress,
      );
      setShareUrl(result.url);
      setExpiresAt(result.expiresAt);
      setIsShared(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please retry.");
    } finally {
      setIsCreating(false);
    }
  };

  const shareFile = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: file?.name || "Shared file",
          text: "Files shared with Deplyze Space.",
          url: shareUrl,
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setError("Sharing unavailable. Copy the link instead.");
      }
    } else {
      await copyLink();
    }
  };

  const reset = () => {
    controller.current?.abort();
    void cancelUpload();
    setFiles([]);
    setError("");
    setShareUrl("");
    setProgress(0);
    setCopied(false);
    setIsCreating(false);
    setIsShared(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const isComplete = Boolean(file && !isCreating);

  return (
    <main className="site-shell">
      <header className="top-nav">
        <a className="nav-label nav-menu" href="#upload">
          Home
        </a>
        <a className="wordmark" href="#upload" aria-label="Deplyze Space home">
          Deplyze Space
        </a>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setIsLight((current) => !current)}
          aria-label={
            isLight ? "Switch to dark theme" : "Switch to light theme"
          }
        >
          {isLight ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
        </button>
      </header>

      <section className="hero" id="upload" aria-labelledby="page-title">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <p className="eyebrow">Private file sharing</p>
          <h1 id="page-title">
            Less is <em>More.</em>
          </h1>
          <p className="hero-subtext">No ads. Just work done.</p>
        </motion.div>

        <div className="experience-wrap">
          <AnimatePresence mode="wait">
            {!file ? (
              <motion.div
                key="empty"
                className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35 }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    inputRef.current?.click();
                }}
                onClick={() => inputRef.current?.click()}
              >
                <UploadMark />
                <div className="drop-copy">
                  <p className="drop-title">Drop anything here</p>
                  <p className="drop-detail">
                    All file types welcome <span>·</span> up to 2 GB
                  </p>
                </div>
                <span className="browse-link">
                  Browse files <ArrowUpRight aria-hidden="true" />
                </span>
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  multiple
                  onChange={(event) => beginUpload(event.target.files)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="uploaded"
                className="share-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                {!isShared ? (
                  <>
                    <div className="file-row">
                      <div className="file-icon">
                        <FileUp strokeWidth={1.2} />
                      </div>
                      <div className="file-meta">
                        <p className="file-name">
                          {files.length > 1
                            ? `${files.length} files`
                            : file.name}
                        </p>
                        <p className="file-size">
                          {formatBytes(files.reduce((n, f) => n + f.size, 0))}{" "}
                          <span>·</span>{" "}
                          {isComplete
                            ? "Ready to upload"
                            : `Uploading ${progress}%`}
                        </p>
                      </div>
                      {progress === 100 && (
                        <Check
                          className="complete-mark"
                          strokeWidth={1.5}
                          aria-label="Upload complete"
                        />
                      )}
                    </div>
                    {!isComplete && (
                      <div
                        className="progress-track"
                        aria-label={`Upload progress ${progress}%`}
                      >
                        <motion.div
                          className="progress-fill"
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    {isComplete && (
                      <div className="file-preview">
                        {file.type.startsWith("image/") ? (
                          <img src={preview} alt={`Preview of ${file.name}`} />
                        ) : file.type.startsWith("video/") ? (
                          <video src={preview} controls />
                        ) : (
                          <div className="file-preview-generic">
                            <FileUp strokeWidth={1} />
                            <span>{file.type || "File"} format</span>
                          </div>
                        )}
                      </div>
                    )}
                    {files.length > 1 && (
                      <ul className="transfer-files">
                        {files.map((f, i) => (
                          <li key={i}>
                            {f.name} <span>{formatBytes(f.size)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {
                      <>
                        <div className="transfer-options">
                          <label>
                            Expires in{" "}
                            <select
                              value={days}
                              disabled={isCreating}
                              onChange={(e) => setDays(Number(e.target.value))}
                            >
                              <option value={1}>1 day</option>
                              <option value={7}>7 days</option>
                              <option value={30}>30 days</option>
                            </select>
                          </label>
                          <label>
                            Password (optional)
                            <input
                              type="password"
                              autoComplete="new-password"
                              minLength={12}
                              maxLength={128}
                              placeholder="At least 12 characters"
                              value={password}
                              disabled={isCreating}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                          </label>
                        </div>
                        <button
                          className="share-primary"
                          type="button"
                          onClick={createShare}
                          disabled={
                            isCreating || (!!password && password.length < 12)
                          }
                        >
                          {isCreating ? (
                            <>
                              <LoaderCircle className="spin" /> Uploading{" "}
                              {progress}%...
                            </>
                          ) : (
                            <>
                              <Share2 /> {error ? "Retry upload" : "Send"}
                            </>
                          )}
                        </button>
                        {isCreating && (
                          <div
                            className="processing-line"
                            aria-label="Processing your file"
                          />
                        )}
                      </>
                    }
                  </>
                ) : (
                  <div className="share-result">
                    <div className="share-result-main">
                      <div className="share-result-heading">
                        <p className="eyebrow">Your private link</p>
                        <Check aria-label="Share complete" />
                      </div>
                      <div className="link-line">
                        <span>{shareUrl}</span>
                        <button
                          className="copy-button"
                          onClick={copyLink}
                          type="button"
                          aria-label={
                            copied ? "Link copied" : "Copy share link"
                          }
                        >
                          {copied ? <Check /> : <Clipboard />}
                        </button>
                      </div>
                      <p className="expiry-note">
                        {files.length} {files.length === 1 ? "file" : "files"} ·
                        Expires {new Date(expiresAt).toLocaleDateString()}
                      </p>
                      <div className="result-actions">
                        <div
                          className="share-primary share-reveal"
                          role="group"
                          aria-label="Share link actions"
                        >
                          <span className="share-label">
                            <Share2 /> Share link
                          </span>
                          <span className="share-options">
                            <button
                              className="share-option"
                              type="button"
                              onClick={shareFile}
                              aria-label="Open sharing"
                            >
                              <Share2 />
                            </button>
                            <button
                              className="share-option"
                              type="button"
                              onClick={copyLink}
                              aria-label="Copy link"
                            >
                              <Clipboard />
                            </button>
                          </span>
                        </div>
                        <button
                          className="text-action"
                          onClick={copyLink}
                          type="button"
                        >
                          <Clipboard /> {copied ? "Copied" : "Copy link"}
                        </button>
                      </div>
                    </div>
                    <QRCodePanel isLight={isLight} shareUrl={shareUrl} />
                  </div>
                )}
                <div className="share-footer">
                  <button className="text-action" onClick={reset} type="button">
                    <RotateCcw data-icon="inline-start" /> Start over
                  </button>
                  <span className="mock-note">
                    {isCreating ? (
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => controller.current?.abort()}
                      >
                        Pause
                      </button>
                    ) : (
                      "Private transfer"
                    )}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p role="alert" className="transfer-error">
          {error}
        </p>
        <div className="quiet-note">
          <span className="quiet-line" /> <span>quietly simple</span>{" "}
          <span className="quiet-line" />
        </div>
      </section>

      <footer className="bottom-nav">
        <span>Less is More © 2026</span>
        <a className="footer-center" href="/privacy">
          Privacy & abuse reporting
        </a>
        <span aria-hidden="true" />
      </footer>
    </main>
  );
}

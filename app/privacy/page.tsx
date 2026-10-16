import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata(
  "Privacy & acceptable use | Deplyze Space",
  "How Deplyze Space handles shared files, passwords, expiry, deletion, and abuse reports. Understand the limits of private link sharing.",
  "/privacy",
);

export default function Privacy() {
  return (
    <main className="site-shell">
      <header className="top-nav">
        <a href="/">Home</a>
        <a className="wordmark" href="/">
          Deplyze Space
        </a>
      </header>
      <article className="policy">
        <h1>Privacy & acceptable use</h1>
        <p>
          Files are stored privately on Cloudflare R2. Transfer metadata
          includes filenames, sizes, expiration, and password hashes when used.
          No account is required. Anyone with a share link can download the
          transfer unless it has a password.
        </p>
        <p>
          Files expire after your selected period. Expired transfers become
          inaccessible immediately; scheduled deletion runs every 15 minutes and
          may take longer during service failures. Unfinished uploads expire
          after 24 hours. Backup lifecycle rules provide a further deletion
          safeguard.
        </p>
        <p>
          Connections use HTTPS in hosted environments. This service does not
          provide end-to-end encryption or operational malware scanning. Do not
          upload unlawful content, malicious files, or material you do not have
          permission to share. Only open downloads from trusted senders.
        </p>
        <p>
          Short-lived rate-limit records and keyed hashes of network addresses
          help prevent abuse. We do not log file contents, passwords, or sharing
          tokens in application diagnostics. Cloudflare and Vercel may process
          network and operational metadata under their own policies.
        </p>
        <p>
          For privacy requests or to report a harmful transfer,{" "}
          <a href="https://github.com/dyglo/deplyze-space/issues/new">
            contact the project maintainer
          </a>
          . Include the transfer ID and a description; do not post passwords or
          sensitive contents publicly.
        </p>
      </article>
    </main>
  );
}

import UploadExperience from "./upload-experience";
import {
  HOME_TITLE,
  HOME_DESCRIPTION,
  publicMetadata,
  websiteSchema,
} from "@/lib/seo";

export const metadata = publicMetadata(HOME_TITLE, HOME_DESCRIPTION, "/");

export default function Page() {
  return (
    <UploadExperience>
      <section className="sharing-guide" aria-labelledby="sharing-title">
        <h2 id="sharing-title">Share files with a link. No signup.</h2>
        <p>
          Send up to 50 files, totaling 2 GB, for free. Choose an expiry, upload
          your files, then share the private link or download its QR code.
        </p>
        <details>
          <summary>Who can download my files?</summary>
          <p>
            Anyone with the link or QR code can download unless you add a
            password before sending. Share passwords separately. Password
            protection is not end-to-end encryption.
          </p>
        </details>
        <details>
          <summary>When do sharing links expire?</summary>
          <p>
            Choose 1, 7, or 30 days before uploading. After expiry, new
            downloads are blocked and files are queued for deletion. Keep your
            own copy; this is temporary sharing, not a backup.
          </p>
        </details>
        <details>
          <summary>How do I share files with a QR code?</summary>
          <p>
            After uploading, download the QR code or let your recipient scan it.
            It opens the same sharing link, with the same password and expiry
            rules. Recipients download files individually.
          </p>
        </details>
        <a href="/privacy">Privacy, limits, and acceptable use</a>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema).replace(/</g, "\\u003c"),
        }}
      />
    </UploadExperience>
  );
}

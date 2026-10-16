import type { Metadata } from "next";

export const SITE_URL = "https://www.deplyze.space";
export const HOME_TITLE = "Free file sharing without signup | Deplyze Space";
export const HOME_DESCRIPTION =
  "Send files online with a private link or QR code. Share up to 2 GB with optional passwords and expiring links. No signup. No ads. Just work done.";

// Absolute URLs preserve the exact root slash in Next.js 16.4 metadata.
// Public pages opt in individually; private pages never inherit a public canonical.
export function publicMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "Deplyze Space",
      url,
      title,
      description,
      images: [
        {
          url: `${SITE_URL}/social-preview.png`,
          width: 1200,
          height: 630,
          alt: "Deplyze Space — Less is More. No ads. Just work done.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${SITE_URL}/social-preview.png`],
    },
  };
}

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Deplyze Space",
  url: `${SITE_URL}/`,
  description: HOME_DESCRIPTION,
  inLanguage: "en",
};

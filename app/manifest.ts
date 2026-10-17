import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deplyze Space",
    short_name: "Deplyze Space",
    description:
      "Free file sharing with private links, optional passwords, and expiry.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: "#11100b",
    theme_color: "#11100b",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

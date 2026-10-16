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
    // Reuse existing artwork. Replacement brand files have not reached main.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

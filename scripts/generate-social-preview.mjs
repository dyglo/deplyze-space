// Typography-only social card; deliberately does not invent or replace brand artwork.
import { ImageResponse } from "next/og.js";
import React from "react";
import { writeFile } from "node:fs/promises";
const h = React.createElement;
const response = new ImageResponse(
  h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#11100b",
        color: "#f3efe5",
      },
    },
    h("div", { style: { fontSize: 30, marginBottom: 56 } }, "Deplyze Space"),
    h("div", { style: { fontSize: 104, letterSpacing: -5 } }, "Less is More."),
    h(
      "div",
      { style: { fontSize: 30, marginTop: 30 } },
      "No ads. Just work done.",
    ),
    h(
      "div",
      { style: { fontSize: 23, marginTop: 56, color: "#b1ada2" } },
      "Free file sharing. No signup.",
    ),
  ),
  { width: 1200, height: 630 },
);
await writeFile(
  new URL("../public/social-preview.png", import.meta.url),
  Buffer.from(await response.arrayBuffer()),
);

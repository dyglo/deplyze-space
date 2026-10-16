import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Keep full-document navigation used by existing transfer reset flows.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  {
    files: ["app/upload-experience.tsx"],
    // Existing preview effect owns and revokes local blob URLs. These are not
    // remote images and must not pass through an image optimization service.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".artifacts/**",
    ".worker-build/**",
    "worker/worker-configuration.d.ts",
    "next-env.d.ts",
  ]),
]);

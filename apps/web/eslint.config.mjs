import base from "../../eslint.config.mjs";
import nextVitals from "eslint-config-next/core-web-vitals";

// nextVitals first so the shared typescript-eslint parser (compatible with ESLint 10.9) wins for every file;
// eslint-config-next 16.3 ships a parser whose scope manager lacks `addGlobals`.
export default [
  ...nextVitals,
  ...base,
  {
    ignores: [".next/**", "public/cdn/**", "next-env.d.ts"],
  },
  {
    settings: { react: { version: "19.2.8" } },
  },
];

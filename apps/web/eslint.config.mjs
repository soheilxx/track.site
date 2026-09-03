import base from "../../eslint.config.mjs";
import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  ...base,
  ...nextVitals,
  {
    ignores: [".next/**", "public/cdn/**", "next-env.d.ts"],
  },
  {
    settings: { react: { version: "19.2.8" } },
  },
];

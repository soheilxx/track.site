// Shared flat ESLint config for the whole monorepo (ESLint 10).
// Apps/packages import this and may extend it (apps/web adds next/core-web-vitals).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/drizzle/meta/**",
      "apps/web/public/cdn/**",
      "**/*.config.{js,mjs,cjs}",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='eval']",
          message: "eval is forbidden (declarative transformations only).",
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: "new Function is forbidden (declarative transformations only).",
        },
      ],
    },
  },
  prettier,
);

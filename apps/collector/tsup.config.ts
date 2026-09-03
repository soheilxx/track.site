import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  // one self-contained file per entry: the require shim below must live in the same module as the bundled CommonJS code
  splitting: false,
  sourcemap: true,
  clean: true,
  noExternal: [/^@track-site\//],
  // bundled CommonJS dependencies (pino, pg helpers) call require(): give the ESM bundle a real require
  banner: { js: "import { createRequire as __tsCreateRequire } from 'node:module'; const require = __tsCreateRequire(import.meta.url);" },
});

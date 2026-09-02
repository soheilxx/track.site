import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/main.ts", "src/cli.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  sourcemap: true,
  clean: true,
  noExternal: [/^@track-site\//],
});

#!/usr/bin/env node
// Starts/stops an embedded PostgreSQL 18 for local development without Docker.
// Usage: node scripts/local-postgres.mjs start|stop|status  (data dir: .local/pgdata, port 54330)
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync , readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, ".local", "pgdata");
const logDir = path.join(root, ".local", "pglog");
const pidFile = path.join(dataDir, "postmaster.pid");
const port = process.env.LOCAL_PG_PORT ?? "54330";
const password = "localdev";

function binDir() {
  // the platform package is named win32-x64 in older releases and windows-x64 from 18.4
  const names = process.platform === "win32" ? [`@embedded-postgres/win32-${process.arch}`, `@embedded-postgres/windows-${process.arch}`] : [`@embedded-postgres/${process.platform}-${process.arch}`];
  // pnpm links only embedded-postgres at the root; its platform package is resolvable from that package's directory
  let fromPkg = require;
  try {
    fromPkg = createRequire(require.resolve("embedded-postgres/package.json"));
  } catch {
    /* fall back to the root resolver */
  }
  for (const pkg of names) {
    try {
      return path.join(path.dirname(fromPkg.resolve(`${pkg}/package.json`)), "native", "bin");
    } catch {
      /* try the next name */
    }
  }
  // last resort: pnpm's virtual store (works even when neither package exposes package.json via exports)
  // the runtime is NOT a workspace dependency (its build scripts would fail the Vercel install):
  // install it once with `pnpm --dir .local/tools --ignore-workspace add embedded-postgres@18.4.0-beta.17`
  for (const store of [path.join(root, ".local", "tools", "node_modules", ".pnpm"), path.join(root, "node_modules", ".pnpm")]) {
    if (!existsSync(store)) continue;
    for (const dir of readdirSync(store)) {
      if (!dir.startsWith("@embedded-postgres+")) continue;
      const inner = path.join(store, dir, "node_modules", "@embedded-postgres");
      for (const name of existsSync(inner) ? readdirSync(inner) : []) {
        const bin = path.join(inner, name, "native", "bin");
        if (existsSync(path.join(bin, process.platform === "win32" ? "postgres.exe" : "postgres"))) {
          const hydrate = path.join(inner, name, "scripts", "hydrate-symlinks.js");
          if (existsSync(hydrate) && !existsSync(path.join(inner, name, "native", ".hydrated"))) {
            try {
              execFileSync(process.execPath, [hydrate], { cwd: path.join(inner, name), stdio: "ignore" });
              writeFileSync(path.join(inner, name, "native", ".hydrated"), "");
            } catch {
              /* symlink hydration is optional on Windows */
            }
          }
          return bin;
        }
      }
    }
  }
  {
    console.error(`Missing ${names.join(" or ")}. Install once: pnpm --dir .local/tools --ignore-workspace add embedded-postgres@18.4.0-beta.17`);
    process.exit(1);
  }
}

const exe = (name) => path.join(binDir(), process.platform === "win32" ? `${name}.exe` : name);
const cmd = process.argv[2] ?? "status";

if (cmd === "start") {
  mkdirSync(logDir, { recursive: true });
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    mkdirSync(dataDir, { recursive: true });
    const pw = path.join(logDir, "pw.txt");
    writeFileSync(pw, password);
    execFileSync(exe("initdb"), ["-D", dataDir, "-U", "postgres", `--pwfile=${pw}`, "-E", "UTF8", "--locale=C"], { stdio: "inherit" });
    rmSync(pw);
    for (const db of ["tracksite_dev", "tracksite_test"]) {
      const single = spawn(exe("postgres"), ["--single", "-D", dataDir, "postgres"], { stdio: ["pipe", "ignore", "ignore"] });
      single.stdin.end(`CREATE DATABASE ${db};\n`);
    }
  }
  if (existsSync(pidFile)) rmSync(pidFile);
  const child = spawn(exe("postgres"), ["-D", dataDir, "-p", port], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  console.log(`PostgreSQL starting on 127.0.0.1:${port} (pid ${child.pid}).`);
  console.log(`DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:${port}/tracksite_dev`);
} else if (cmd === "stop") {
  if (!existsSync(pidFile)) {
    console.log("not running");
  } else {
    const pid = Number(readFileSync(pidFile, "utf8").split("\n")[0]);
    process.kill(pid, process.platform === "win32" ? undefined : "SIGTERM");
    console.log(`stopped pid ${pid}`);
  }
} else {
  console.log(existsSync(pidFile) ? `running (pid file ${pidFile})` : "not running");
}

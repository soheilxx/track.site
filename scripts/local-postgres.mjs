#!/usr/bin/env node
// Starts/stops an embedded PostgreSQL 18 for local development without Docker.
// Usage: node scripts/local-postgres.mjs start|stop|status  (data dir: .local/pgdata, port 54330)
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
  const pkg = `@embedded-postgres/${process.platform}-${process.arch}`;
  try {
    return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "native", "bin");
  } catch {
    console.error(`Missing ${pkg}. Install once: pnpm add -D -w embedded-postgres@18`);
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

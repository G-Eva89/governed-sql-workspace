import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const target = process.argv[2];
let psqlArgs = process.argv.slice(3);
if (psqlArgs[0] === "--") {
  psqlArgs = psqlArgs.slice(1);
}

const scripts = {
  app: isWindows ? "psql-app.ps1" : "psql-app.sh",
  target: isWindows ? "psql-target.ps1" : "psql-target.sh",
};

if (!scripts[target]) {
  console.error("Usage: node scripts/run-psql.mjs <app|target> [psql args...]");
  process.exit(1);
}

const script = path.join(rootDir, "scripts", scripts[target]);
const result = isWindows
  ? spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...psqlArgs],
      { stdio: "inherit", cwd: rootDir },
    )
  : spawnSync("bash", [script, ...psqlArgs], { stdio: "inherit", cwd: rootDir });

process.exit(result.status ?? 1);

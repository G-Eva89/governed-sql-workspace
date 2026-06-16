import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

function run(scriptName) {
  const script = path.join(rootDir, "scripts", scriptName);
  const result = isWindows
    ? spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
        stdio: "inherit",
        cwd: rootDir,
      })
    : spawnSync("bash", [script], { stdio: "inherit", cwd: rootDir });

  process.exit(result.status ?? 1);
}

run(isWindows ? "seed-target-pagila.ps1" : "seed-target-pagila.sh");

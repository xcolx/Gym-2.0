import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { backendEnv, python } from "./env";

/** Inserts the exercise catalog, once per database */
export default function globalSetup() {
  execFileSync(python, [resolve(__dirname, "seed_catalog.py")], {
    cwd: resolve(__dirname, "../../backend"),
    env: { ...process.env, ...backendEnv },
    stdio: "inherit",
  });
}

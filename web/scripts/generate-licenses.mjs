// Writes src/components/legal/third-party-licenses.json, the packages of /licenses with their licence texts. Runs
// before `next build` and with `npm run licenses`, commit the file when it changes (typecheck and the tests run before
// the build). See "Third-party licenses" in ARCHITECTURE.md.
//
// The packages are the dependencies of package.json, plus tailwindcss, whose preflight is part of the CSS, and
// everything they depend on, as resolved in package-lock.json. Optional dependencies (the platform binaries of sharp
// and the SWC compiler) and peer dependencies are skipped: they only run on the server or at build time, and leaving
// them out keeps the file the same on every platform.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(root, "src/components/legal/third-party-licenses.json");
/** Packages that reach the browser without being a dependency of package.json */
const EXTRA_ROOTS = ["tailwindcss"];
/** The files of a package that hold its licence or the notices that must be passed on with it */
const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyrightnotice)(\.(md|txt))?$/i;

const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** The lock file entry a package at `from` resolves `name` to, like Node: the nearest node_modules upwards */
function resolve(name, from) {
  let dir = from;
  for (;;) {
    const path = `${dir ? `${dir}/` : ""}node_modules/${name}`;
    if (lock.packages[path]) return path;
    if (!dir) throw new Error(`${name} (needed by ${from || "package.json"}) is not in package-lock.json`);
    const index = dir.lastIndexOf("/node_modules/");
    dir = index === -1 ? "" : dir.slice(0, index);
  }
}

/** The repository of a package as a web URL, e.g. https://github.com/facebook/react */
function repositoryUrl(repository) {
  const url = typeof repository === "string" ? repository : repository?.url;
  if (!url) return null;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return url.replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "");
}

const paths = new Set();
const queue = [...Object.keys(packageJson.dependencies), ...EXTRA_ROOTS].map((name) => resolve(name, ""));
while (queue.length > 0) {
  const path = queue.pop();
  if (paths.has(path)) continue;
  paths.add(path);
  for (const name of Object.keys(lock.packages[path].dependencies ?? {})) queue.push(resolve(name, path));
}

const packages = [...paths]
  .map((path) => {
    const dir = join(root, path);
    if (!existsSync(dir)) throw new Error(`${path} is not installed, run npm ci first`);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const files = readdirSync(dir)
      .filter((file) => LICENSE_FILE.test(file))
      .sort((a, b) => a.localeCompare(b));
    return {
      name: manifest.name,
      version: manifest.version,
      license: lock.packages[path].license ?? manifest.license ?? "UNKNOWN",
      repository: repositoryUrl(manifest.repository),
      texts: files.map((file) => readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim()),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

writeFileSync(OUTPUT, `${JSON.stringify(packages, null, 2)}\n`);
console.log(`Wrote the licences of ${packages.length} packages to ${OUTPUT.slice(root.length + 1)}`);

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { checkRelease } from "./sync_package_baseline.mjs";
import { buildSnapshot } from "./sync_layout_contract.mjs";

import { REPO_ROOT, SDK_ROOT, projectPaths, corePackageRoot } from "./project-paths.mjs";

export const ASTRO_ROOT = SDK_ROOT;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function archiveFiles(root = ASTRO_ROOT) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(tmpdir(), "moo-astro-npm-cache"),
    },
  });
  return JSON.parse(output)[0].files.map((entry) => entry.path).sort();
}

function sortedEntries(object) {
  return Object.entries(object).sort(([left], [right]) => left.localeCompare(right));
}

export async function assertAstroSurface({
  root = ASTRO_ROOT,
  files = archiveFiles(root),
  manifest,
  record,
} = {}) {
  const expected = record ?? await readJson(join(root, "contracts/astro-public-surface.json"));
  const actual = manifest ?? await readJson(join(root, "package.json"));
  if (actual.name !== expected.package || actual.version !== expected.version) {
    throw new Error("Astro package identity differs from the public surface record");
  }
  const packed = new Set(files);
  for (const privatePath of expected.private_transitives) {
    if (Object.values(actual.exports).includes(`./${privatePath}`)) {
      throw new Error(`private transitive ${privatePath} became a public export`);
    }
    if (!packed.has(privatePath)) {
      throw new Error(`private transitive ${privatePath} is missing from archive`);
    }
  }
  if (JSON.stringify(sortedEntries(actual.exports)) !== JSON.stringify(sortedEntries(expected.exports))) {
    throw new Error("Astro public export map differs from the exact record");
  }
  for (const [specifier, target] of Object.entries(actual.exports)) {
    if (!target.startsWith("./") || target.includes("..")) {
      throw new Error(`${specifier} public target escapes the package`);
    }
    const archivePath = target.slice(2);
    if (!packed.has(archivePath)) {
      throw new Error(`${specifier} public target is missing from archive`);
    }
    const targetStat = await stat(join(root, archivePath)).catch(() => null);
    if (!targetStat?.isFile()) {
      throw new Error(`${specifier} public target is missing on disk`);
    }
  }
  if (JSON.stringify([...files].sort()) !== JSON.stringify([...expected.files].sort())) {
    throw new Error("Astro archive file list differs from the exact record");
  }
  return files;
}

export async function assertSourceClosure({
  root = ASTRO_ROOT,
  files = archiveFiles(root),
  coreExports,
} = {}) {
  const packed = new Set(files);
  const exports = coreExports ?? (await readJson(join(ASTRO_ROOT, "contracts/rc10-package.json"))).exports;
  for (const file of files.filter((path) => /^src\/.+\.(?:astro|js|css)$/.test(path))) {
    const source = await readFile(join(root, file), "utf8");
    const imports = [
      ...source.matchAll(/(?:^|\n)\s*import(?:\s+[^;\n]*?\s+from)?\s*["']([^"']+)["']/g),
      ...source.matchAll(/@import\s*["']([^"']+)["']/g),
    ].map((match) => match[1]);
    for (const specifier of imports) {
      if (specifier.startsWith("@wpmoo/ui/")) {
        const [corePath, query] = specifier.slice("@wpmoo/ui/".length).split("?");
        const coreExport = `./${corePath}`;
        if (query && !(coreExport === "./state.js" && query === "raw")) {
          throw new Error(`${file} source import ${specifier} uses an unregistered transform`);
        }
        if (!(coreExport in exports)) {
          throw new Error(`${file} source import ${specifier} is not in the active Moo export registry`);
        }
      } else if (specifier.startsWith(".")) {
        const target = relative(root, resolve(root, dirname(file), specifier));
        if (target.startsWith("..") || !packed.has(target)) {
          throw new Error(`${file} source import ${specifier} is missing from packed files`);
        }
      }
    }
  }
}

export function assertDevelopmentSnapshot({ stored, current }) {
  if (stored.source?.commit !== current.source?.commit) {
    throw new Error("development layout snapshot source commit differs from HTML dev");
  }
  if (JSON.stringify(stored) !== JSON.stringify(current)) {
    throw new Error("development layout snapshot content differs from HTML dev");
  }
}

export async function verifyBoundary({ mode = "release", repoRoot = REPO_ROOT } = {}) {
  const root = projectPaths(repoRoot).sdkRoot;
  if (mode !== "release" && mode !== "dev") {
    throw new Error("--mode must be release or dev");
  }
  if (mode === "release") {
    await checkRelease({ repoRoot });
  } else {
    const stored = await readJson(join(root, "contracts/layout-surface.snapshot.json"));
    const current = await buildSnapshot(resolve(repoRoot, "../html"));
    assertDevelopmentSnapshot({ stored, current });
  }
  const files = archiveFiles(root);
  await assertAstroSurface({ root, files });
  const coreExports = mode === "dev"
    ? (await readJson(join(corePackageRoot(repoRoot), "package.json"))).exports
    : undefined;
  await assertSourceClosure({ root, files, coreExports });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf("--mode");
  const mode = modeIndex < 0 ? "release" : args[modeIndex + 1];
  verifyBoundary({ mode })
    .then(() => console.log(`Astro ${mode} boundary: OK`))
    .catch((error) => {
      console.error(`Astro ${mode} boundary: ${error.message}`);
      process.exitCode = 1;
    });
}

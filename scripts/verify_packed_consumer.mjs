#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ASTRO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_ROOT = resolve(ASTRO_ROOT, "../../..");
const FIXTURE_ROOT = join(ASTRO_ROOT, "tests/fixtures/consumer");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
  return result.stdout;
}

function assertOutsideWorkspace(path, label) {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  const resolved = resolve(path);
  const fromWorkspace = relative(WORKSPACE_ROOT, resolved);
  if (!fromWorkspace.startsWith("..") && fromWorkspace !== "") {
    throw new Error(`${label} must be outside the workspace`);
  }
  return resolved;
}

export function validateConsumerFixture({ source, manifest }) {
  const importPaths = [...source.matchAll(/\bimport(?:\s+[^;\n]*?\s+from)?\s*["']([^"']+)["']/g)].map((match) => match[1]);
  const expected = Object.keys(manifest.exports)
    .filter((path) => path !== "./package.json")
    .map((path) => `${manifest.name}/${path.slice(2)}`);
  if (importPaths.length !== expected.length ||
      new Set(importPaths).size !== expected.length ||
      expected.some((path) => !importPaths.includes(path))) {
    throw new Error("consumer imports must use exact Astro public entrypoints");
  }
  return importPaths.length;
}

export function validateConsumerLock({ fixtureManifest, fixtureLock, manifest, core }) {
  const archive = `file:../wpmoo-ui-astro-${manifest.version}.tgz`;
  const direct = fixtureManifest.dependencies;
  const root = fixtureLock.packages?.[""];
  const adapter = fixtureLock.packages?.[`node_modules/${manifest.name}`];
  const installedCore = fixtureLock.packages?.[`node_modules/${core.package}`];
  if (direct?.[manifest.name] !== archive || direct.astro !== manifest.dependencies.astro ||
      root?.dependencies?.[manifest.name] !== archive || root.dependencies.astro !== direct.astro ||
      adapter?.version !== manifest.version || adapter.resolved !== archive ||
      JSON.stringify(adapter.dependencies) !== JSON.stringify(manifest.dependencies)) {
    throw new Error("consumer lock must pin the local adapter and its exact dependencies");
  }
  if (installedCore?.version !== core.version ||
      installedCore.resolved !== core.registry_url ||
      installedCore.integrity !== core.integrity) {
    throw new Error("consumer Core release pin differs from published RC9");
  }
}

export function assertConsumerOutput(html) {
  const required = [
    ['data-moo-document-owner="true"', "Moo document owner"],
    ['data-slot="sidebar-wrapper"', "Sidebar wrapper"],
    ['data-slot="sidebar"', "direct Sidebar"],
    ['data-slot="page"', "Page"],
    ['id="main-content"', "focusable main"],
    ['data-page-container', "Page rail"],
    ['data-layout="page-grid"', "Page grid"],
    ['data-public-wrapper-count="45"', "45 public wrapper imports"],
    ['btn-icon-sm', "published icon button size"],
    ['&lt;img src=x onerror=alert(1)&gt;', "untrusted text must be escaped"],
  ];
  for (const [marker, label] of required) {
    if (!html.includes(marker)) throw new Error(`consumer HTML is missing ${label}`);
  }
  if (html.includes("<img src=x onerror=alert(1)>")) {
    throw new Error("untrusted text must be escaped");
  }
}

export function assertPrivateSubpathError(result) {
  if (result.status === 0 || !result.stderr.includes("ERR_PACKAGE_PATH_NOT_EXPORTED")) {
    throw new Error("private deep import must fail with ERR_PACKAGE_PATH_NOT_EXPORTED");
  }
}

export async function verifyPackedConsumer({ cache, output }) {
  const cachePath = assertOutsideWorkspace(cache, "cache");
  const outputPath = assertOutsideWorkspace(output, "output");
  const manifest = JSON.parse(await readFile(join(ASTRO_ROOT, "package.json"), "utf8"));
  const fixtureSource = await readFile(join(FIXTURE_ROOT, "src/pages/index.astro"), "utf8");
  const fixtureManifest = JSON.parse(await readFile(join(FIXTURE_ROOT, "package.json"), "utf8"));
  const fixtureLock = JSON.parse(await readFile(join(FIXTURE_ROOT, "package-lock.json"), "utf8"));
  const core = JSON.parse(await readFile(join(ASTRO_ROOT, "contracts/rc9-package.json"), "utf8"));
  const importCount = validateConsumerFixture({ source: fixtureSource, manifest });
  validateConsumerLock({ fixtureManifest, fixtureLock, manifest, core });
  await mkdir(outputPath, { recursive: true });
  await mkdir(cachePath, { recursive: true });
  assertOutsideWorkspace(await realpath(outputPath), "output");
  assertOutsideWorkspace(await realpath(cachePath), "cache");

  const packOutput = run("npm", ["pack", "--pack-destination", outputPath, "--json"], {
    cwd: ASTRO_ROOT,
    env: { ...process.env, npm_config_cache: cachePath },
  });
  const packed = JSON.parse(packOutput)[0];
  if (fixtureManifest.dependencies[manifest.name] !== `file:../${packed.filename}`) {
    throw new Error("consumer lock local archive name differs from the packed adapter");
  }
  const archivePath = join(outputPath, packed.filename);
  const consumerPath = join(outputPath, "consumer");
  await cp(FIXTURE_ROOT, consumerPath, { recursive: true, errorOnExist: true, force: false });
  const executionLock = structuredClone(fixtureLock);
  executionLock.packages[`node_modules/${manifest.name}`].integrity = packed.integrity;
  await writeFile(join(consumerPath, "package-lock.json"), `${JSON.stringify(executionLock, null, 2)}\n`);
  const offlineEnv = {
    ...process.env,
    npm_config_cache: cachePath,
    npm_config_offline: "true",
    npm_config_registry: "https://registry.npmjs.org/",
    npm_config_audit: "false",
    npm_config_fund: "false",
  };
  run("npm", ["ci", "--offline", "--no-audit", "--no-fund"], {
    cwd: consumerPath,
    env: offlineEnv,
  });
  const privateProbe = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    "import.meta.resolve('@wpmoo/ui-astro/components/internal/Icon.astro')",
  ], { cwd: consumerPath, encoding: "utf8", env: offlineEnv });
  assertPrivateSubpathError(privateProbe);
  run("npm", ["run", "build"], { cwd: consumerPath, env: offlineEnv });
  const htmlPath = join(consumerPath, "dist/index.html");
  const html = await readFile(htmlPath, "utf8");
  assertConsumerOutput(html);

  const proof = {
    schema_version: 1,
    adapter: `${manifest.name}@${manifest.version}`,
    upstream: "@wpmoo/ui@1.0.0-rc.9",
    archive: packed.filename,
    archive_sha256: sha256(await readFile(archivePath)),
    built_html: "consumer/dist/index.html",
    built_html_sha256: sha256(Buffer.from(html)),
    public_source_imports: importCount,
    installation: "npm ci --offline; container network disabled",
    private_subpath: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  };
  await writeFile(join(outputPath, "proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
  return proof;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (name) => args[args.indexOf(name) + 1];
  if (!args.includes("--cache") || !args.includes("--output")) {
    console.error("Usage: node scripts/verify_packed_consumer.mjs --cache /absolute/cache --output /absolute/empty-directory");
    process.exitCode = 2;
  } else {
    verifyPackedConsumer({ cache: get("--cache"), output: get("--output") })
      .then((proof) => console.log(`Packed offline consumer: OK (${proof.public_source_imports} public source imports, ${proof.archive_sha256})`))
      .catch((error) => {
        console.error(`Packed offline consumer: ${error.message}`);
        process.exitCode = 1;
      });
  }
}

#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
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
  const importPaths = [...source.matchAll(/\bimport(?:\s+[^;\n]*?\s+from)?\s*["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((path) => path === manifest.name || path.startsWith(`${manifest.name}/`));
  const expected = Object.keys(manifest.exports)
    .filter((path) => path !== "./package.json")
    .map((path) => path === "." ? manifest.name : `${manifest.name}/${path.slice(2)}`);
  if (importPaths.length !== expected.length ||
      new Set(importPaths).size !== expected.length ||
      expected.some((path) => !importPaths.includes(path))) {
    throw new Error("consumer imports must use exact Astro public entrypoints");
  }
  return importPaths.length;
}

export function validateConsumerLock({ fixtureManifest, fixtureLock, manifest, core }) {
  const archive = `file:../wpmoo-astro-${manifest.version}.tgz`;
  const direct = fixtureManifest.dependencies;
  const root = fixtureLock.packages?.[""];
  const adapter = fixtureLock.packages?.[`node_modules/${manifest.name}`];
  const installedCore = fixtureLock.packages?.[`node_modules/${core.package}`];
  if (direct?.[manifest.name] !== archive || direct.astro !== manifest.peerDependencies.astro ||
      root?.dependencies?.[manifest.name] !== archive || root.dependencies.astro !== direct.astro ||
      adapter?.version !== manifest.version || adapter.resolved !== archive ||
      JSON.stringify(adapter.dependencies) !== JSON.stringify(manifest.dependencies) ||
      JSON.stringify(adapter.peerDependencies) !== JSON.stringify(manifest.peerDependencies)) {
    throw new Error("consumer lock must pin the local adapter and its exact dependencies");
  }
  const astroPaths = Object.keys(fixtureLock.packages).filter((path) => path.endsWith("node_modules/astro"));
  if (astroPaths.length !== 1 || astroPaths[0] !== "node_modules/astro" ||
      fixtureLock.packages[astroPaths[0]].version !== manifest.peerDependencies.astro) {
    throw new Error("consumer lock must contain one certified host Astro peer");
  }
  if (Object.keys(fixtureLock.packages).some((path) => path.endsWith("node_modules/@astrojs/mdx"))) {
    throw new Error("MD-only consumer must install without MDX");
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
    ['data-public-part-count="7"', "seven public include and view imports"],
    ['data-public-page-view-count="3"', "three public Page view imports"],
    ['data-context-plugin="page"', "public Page route context"],
    ['data-context-link="/contact"', "canonical Page context link"],
    ['data-navigation-count="2"', "public Page navigation"],
    ['data-config-sidebar="none"', "public site preference resolution"],
    ['data-config-slug="iletisim"', "public Turkish slug normalization"],
    ['data-plugin-id="page"', "public plugin descriptor"],
    ['btn-icon-sm', "published icon button size"],
    ['data-toast-show-on-load="true"', "published Toast startup hook"],
    ['aria-label="Dismiss saved toast"', "published Toast action label"],
    ['&lt;svg onload=alert(2)&gt;', "Toast untrusted body must be escaped"],
    ['<strong>Approved</strong>', "trusted caller markup opt-in"],
    ['&lt;img src=x onerror=alert(1)&gt;', "untrusted text must be escaped"],
  ];
  for (const [marker, label] of required) {
    if (!html.includes(marker)) throw new Error(`consumer HTML is missing ${label}`);
  }
  if (html.includes("<img src=x onerror=alert(1)>")) {
    throw new Error("untrusted text must be escaped");
  }
  if (html.includes("<svg onload=alert(2)>")) {
    throw new Error("Toast untrusted body must be escaped");
  }
}

export function assertPackedPageOutput({ contact, guide, draftExists }) {
  for (const [html, title, body] of [
    [contact, "Contact", "Independent Page content."],
    [guide, "Setup guide", "Independent guide content."],
  ]) {
    if (!html.includes(`<title>${title}</title>`) || !html.includes(body) ||
        [...html.matchAll(/<h1(?:\s|>)/gu)].length !== 1) {
      throw new Error(`${title} Page route must render its published title and Markdown once`);
    }
  }
  if (!contact.includes('page page-contact') || !contact.includes('href="/contact"')) {
    throw new Error("Contact Page route must preserve its exact entry identity and canonical href");
  }
  if (!guide.includes('data-slot="sidebar"') || !guide.includes('href="/guide/setup"') ||
      !guide.includes('aria-current="page"')) {
    throw new Error("Guide Page route must inherit the public Sidebar and active canonical link");
  }
  if (draftExists) throw new Error("Draft Page must not be published by the packed consumer");
}

export function assertPrivateSubpathError(result) {
  if (result.status === 0 || !result.stderr.includes("ERR_PACKAGE_PATH_NOT_EXPORTED")) {
    throw new Error("private deep import must fail with ERR_PACKAGE_PATH_NOT_EXPORTED");
  }
}

export function assertThemeOutput({ home, contact, guide }) {
  for (const [name, html, expected] of [
    ["home", home, ["container-xl", "py-3", "py-md-5"]],
    ["contact", contact, ["container-lg"]],
    ["guide", guide, ["container-xl", "py-3", "py-md-5"]],
  ]) {
    const rails = [...html.matchAll(/<div\b(?=[^>]*\bdata-page-container(?:\s|>|=))[^>]*>/gu)];
    const actual = rails[0]?.[0].match(/\bclass="([^"]*)"/u)?.[1].split(/\s+/u).filter(Boolean).sort();
    if (rails.length !== 1 || JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      throw new Error(`${name} must render its resolved theme preferences on one Page rail`);
    }
  }
  for (const html of [contact, guide]) {
    if (!html.includes('<header class="bg-body-tertiary border-bottom">')) {
      throw new Error("Theme Header preferences must reach both built-in Page routes");
    }
  }
}

export function assertPeerConflict(result, certifiedVersion) {
  if (result.status === 0 || !result.stderr.includes("ERESOLVE") ||
      !result.stderr.includes(`peer astro@"${certifiedVersion}"`)) {
    throw new Error("incompatible host must fail with npm ERESOLVE for the certified Astro peer");
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
  const surface = JSON.parse(await readFile(join(ASTRO_ROOT, "contracts/astro-public-surface.json"), "utf8"));
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
  run("npm", ["ci", "--offline", "--strict-peer-deps", "--no-audit", "--no-fund"], {
    cwd: consumerPath,
    env: offlineEnv,
  });
  const consumerRequire = createRequire(join(consumerPath, "package.json"));
  const consumerAstro = await realpath(consumerRequire.resolve("astro/package.json"));
  const adapterAstro = await realpath(createRequire(join(consumerPath, "node_modules", manifest.name, "package.json")).resolve("astro/package.json"));
  if (consumerAstro !== adapterAstro) throw new Error("consumer and adapter must resolve the same Astro host");
  try {
    consumerRequire.resolve("@astrojs/mdx");
    throw new Error("MD-only consumer installed MDX");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }
  const privateSubpaths = Object.fromEntries(surface.private_transitives.map((path) => [path, "ERR_PACKAGE_PATH_NOT_EXPORTED"]));
  for (const path of surface.private_transitives) {
    const specifier = `${manifest.name}/${path}`;
    const privateProbe = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import.meta.resolve(${JSON.stringify(specifier)})`,
    ], { cwd: consumerPath, encoding: "utf8", env: offlineEnv });
    assertPrivateSubpathError(privateProbe);
  }
  const typeOutput = run("npm", ["run", "check"], { cwd: consumerPath, env: offlineEnv });
  await writeFile(join(outputPath, "type-check.log"), typeOutput);
  run("npm", ["run", "build"], { cwd: consumerPath, env: offlineEnv });

  // This fixture is official registry metadata, never installed: npm must reject
  // the unsupported host before fetching or running that version.
  const incompatible = JSON.parse(await readFile(join(ASTRO_ROOT, "tests/fixtures/incompatible-astro-peer.json"), "utf8"));
  const incompatiblePath = join(outputPath, "consumer-incompatible");
  await mkdir(incompatiblePath);
  const incompatibleManifest = structuredClone(fixtureManifest);
  const incompatibleLock = structuredClone(executionLock);
  incompatibleManifest.dependencies.astro = incompatible.version;
  incompatibleLock.packages[""].dependencies.astro = incompatible.version;
  incompatibleLock.packages["node_modules/astro"] = incompatible;
  await writeFile(join(incompatiblePath, "package.json"), JSON.stringify(incompatibleManifest));
  await writeFile(join(incompatiblePath, "package-lock.json"), JSON.stringify(incompatibleLock));
  const peerResult = spawnSync("npm", ["ci", "--offline", "--strict-peer-deps", "--no-audit", "--no-fund"], {
    cwd: incompatiblePath, env: offlineEnv, encoding: "utf8",
  });
  assertPeerConflict(peerResult, manifest.peerDependencies.astro);
  const peerOutput = peerResult.stderr + peerResult.stdout;
  await writeFile(join(outputPath, "peer-conflict.log"), peerOutput);
  const htmlPath = join(consumerPath, "dist/index.html");
  const html = await readFile(htmlPath, "utf8");
  assertConsumerOutput(html);
  const contactPath = join(consumerPath, "dist/contact/index.html");
  const guidePath = join(consumerPath, "dist/guide/setup/index.html");
  const contact = await readFile(contactPath, "utf8");
  const guide = await readFile(guidePath, "utf8");
  const draftExists = await stat(join(consumerPath, "dist/draft/index.html"))
    .then(() => true, (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
  assertPackedPageOutput({ contact, guide, draftExists });
  assertThemeOutput({ home: html, contact, guide });

  const proof = {
    schema_version: 1,
    adapter: `${manifest.name}@${manifest.version}`,
    upstream: "@wpmoo/ui@1.0.0-rc.9",
    archive: packed.filename,
    archive_sha256: sha256(await readFile(archivePath)),
    built_html: "consumer/dist/index.html",
    built_html_sha256: sha256(Buffer.from(html)),
    built_pages: {
      contact: { path: "consumer/dist/contact/index.html", sha256: sha256(Buffer.from(contact)) },
      guide: { path: "consumer/dist/guide/setup/index.html", sha256: sha256(Buffer.from(guide)) },
    },
    public_source_imports: importCount,
    host_astro: { version: manifest.peerDependencies.astro, single_resolved_path: relative(outputPath, consumerAstro) },
    mdx_installed: false,
    theme_preferences: "Shared Layout utilities and Header surface; isolated Contact utility replacement; public readonly types",
    type_check: "npm run check",
    type_check_output: { path: "type-check.log", sha256: sha256(Buffer.from(typeOutput)) },
    incompatible_peer: { host_version: incompatible.version, exit_code: peerResult.status, code: "ERESOLVE", path: "peer-conflict.log", sha256: sha256(Buffer.from(peerOutput)) },
    installation: "npm ci --offline --strict-peer-deps; container network disabled",
    private_subpath: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    private_subpaths: privateSubpaths,
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

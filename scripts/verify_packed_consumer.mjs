#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import ts from "typescript";

import {
  assertPackedContainer,
  assertPlainInputTree,
  validateProfileLock,
} from "./packed_consumer_contracts.mjs";
export {
  assertPackedContainer,
  assertPlainInputTree,
  validateProfileLock,
  assertConsumerOutput,
  assertPackedPageOutput,
  assertThemeOutput,
  assertNotFoundOutput,
  assertPrivateSubpathError,
  assertPeerConflict,
} from "./packed_consumer_contracts.mjs";

import { REPO_ROOT, SDK_ROOT, CONSUMER_ROOT } from "./project-paths.mjs";

const WORKSPACE_ROOT = resolve(REPO_ROOT, "../../..");
const FIXTURE_ROOT = CONSUMER_ROOT;

export async function assertRetainedArtifacts(root, artifacts) {
  for (const [name, artifact] of Object.entries(artifacts)) {
    const bytes = await readFile(join(root, artifact.filename));
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
      throw new Error(
        `retained archive changed after isolated execution: ${name}`,
      );
  }
}

export const PACKED_PROFILES = Object.freeze({
  default: "consumer",
  theme: "theme",
  "ui-only": "ui-only",
  "page-only": "page-only",
  "post-only": "post-only",
  mdx: "mdx",
  "external-plugin": "external-consumer",
  taxonomy: "taxonomy",
  "external-taxonomy": "external-taxonomy",
  "content-editing": "content-editing",
  "not-found": "not-found",
  "not-found-host": "not-found-host",
});

const USAGE =
  "Usage: node scripts/verify_packed_consumer.mjs --fixture all --cache /absolute/primed-cache --output /absolute/empty-proof --image <existing-local-image>";

export function parsePackedArguments(args) {
  const options = { fixture: "all" };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!["--fixture", "--cache", "--output", "--image"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    const value = args[index + 1];
    if (
      typeof value !== "string" ||
      !value ||
      value.startsWith("--") ||
      /[\u0000-\u001f\u007f]/u.test(value)
    ) {
      throw new Error(`Missing or invalid value for ${flag}`);
    }
    options[flag.slice(2)] = value;
    seen.add(flag);
  }
  for (const name of ["cache", "output", "image"]) {
    if (!seen.has(`--${name}`)) throw new Error(`Missing argument: --${name}`);
  }
  for (const name of ["cache", "output"]) {
    if (!isAbsolute(options[name]))
      throw new Error(`--${name} must be an absolute path`);
  }
  if (
    options.fixture !== "all" &&
    !Object.hasOwn(PACKED_PROFILES, options.fixture)
  ) {
    throw new Error(`Unknown fixture: ${options.fixture}`);
  }
  if (/\s/u.test(options.image))
    throw new Error("--image must name one existing local image");
  return options;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`,
    );
  }
  return result.stdout;
}

export function validateConsumerFixture({ source, manifest }) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  const blocks = frontmatter ? [frontmatter[1]] : [];
  const template = frontmatter ? source.slice(frontmatter[0].length) : source;
  for (const match of template.matchAll(
    /<!--[\s\S]*?-->|<script\b[^>]*>([\s\S]*?)<\/script\s*>/gu,
  )) {
    if (match[1] !== undefined) blocks.push(match[1]);
  }
  const parsed = blocks.map((block) =>
    ts.createSourceFile(
      "consumer.ts",
      block,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  );
  const importPaths = parsed
    .flatMap((file) =>
      file.statements
        .filter(
          (statement) =>
            ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier),
        )
        .map((statement) => statement.moduleSpecifier.text),
    )
    .filter(
      (path) => path === manifest.name || path.startsWith(`${manifest.name}/`),
    );
  const expected = Object.keys(manifest.exports)
    .filter((path) => path !== "./package.json")
    .map((path) =>
      path === "." ? manifest.name : `${manifest.name}/${path.slice(2)}`,
    );
  if (
    parsed.some((file) => file.parseDiagnostics.length > 0) ||
    importPaths.length !== expected.length ||
    new Set(importPaths).size !== expected.length ||
    expected.some((path) => !importPaths.includes(path))
  ) {
    throw new Error("consumer imports must use exact Astro public entrypoints");
  }
  return importPaths.length;
}

export function validateConsumerLock({
  fixtureManifest,
  fixtureLock,
  manifest,
  core,
}) {
  const archive = `file:../wpmoo-astro-${manifest.version}.tgz`;
  const direct = fixtureManifest.dependencies;
  const root = fixtureLock.packages?.[""];
  const adapter = fixtureLock.packages?.[`node_modules/${manifest.name}`];
  const installedCore = fixtureLock.packages?.[`node_modules/${core.package}`];
  if (
    direct?.[manifest.name] !== archive ||
    direct.astro !== manifest.peerDependencies.astro ||
    root?.dependencies?.[manifest.name] !== archive ||
    root.dependencies.astro !== direct.astro ||
    adapter?.version !== manifest.version ||
    adapter.resolved !== archive ||
    JSON.stringify(adapter.dependencies) !==
      JSON.stringify(manifest.dependencies) ||
    JSON.stringify(adapter.peerDependencies) !==
      JSON.stringify(manifest.peerDependencies)
  ) {
    throw new Error(
      "consumer lock must pin the local adapter and its exact dependencies",
    );
  }
  const astroPaths = Object.keys(fixtureLock.packages).filter((path) =>
    path.endsWith("node_modules/astro"),
  );
  if (
    astroPaths.length !== 1 ||
    astroPaths[0] !== "node_modules/astro" ||
    fixtureLock.packages[astroPaths[0]].version !==
      manifest.peerDependencies.astro
  ) {
    throw new Error("consumer lock must contain one certified host Astro peer");
  }
  if (
    Object.keys(fixtureLock.packages).some((path) =>
      path.endsWith("node_modules/@astrojs/mdx"),
    )
  ) {
    throw new Error("MD-only consumer must install without MDX");
  }
  if (
    installedCore?.version !== core.version ||
    installedCore.resolved !== core.registry_url ||
    installedCore.integrity !== core.integrity
  ) {
    throw new Error(
      "consumer Core release pin differs from published Core release",
    );
  }
}

async function canonicalMount(path, label, { mustExist = true } = {}) {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  let current = resolve(path);
  const missing = [];
  while (true) {
    try {
      const canonical = await realpath(current);
      const final = resolve(canonical, ...missing.reverse());
      const workspace = await realpath(WORKSPACE_ROOT);
      const inside = (parent, child) => {
        const value = relative(parent, child);
        return (
          value === "" ||
          (value !== ".." && !value.startsWith("../") && !isAbsolute(value))
        );
      };
      if (inside(workspace, final) || inside(final, workspace))
        throw new Error(`${label} cannot be inside or contain the workspace`);
      if (mustExist && missing.length)
        throw new Error(`${label} must be an existing primed directory`);
      return final;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(basename(current));
      current = dirname(current);
    }
  }
}

async function copyFixture(source, target) {
  const names = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        directory === source &&
        ["node_modules", ".astro", "dist", ".cache", ".vite", ".git"].includes(
          entry.name,
        )
      )
        continue;
      const full = join(directory, entry.name);
      const name = relative(source, full);
      if (entry.isSymbolicLink())
        throw new Error(`prepared fixture symlink is forbidden: ${name}`);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        await mkdir(dirname(join(target, name)), { recursive: true });
        await writeFile(join(target, name), await readFile(full));
        names.push(name);
      } else
        throw new Error(
          `prepared fixture has an unsupported file kind: ${name}`,
        );
    }
  }
  await visit(source);
  return names.sort();
}

export async function verifyPackedConsumer({
  cache,
  output,
  fixture = "all",
  image,
}) {
  const selected = fixture === "all" ? Object.keys(PACKED_PROFILES) : [fixture];
  const cachePath = await canonicalMount(cache, "cache");
  const outputPath = await canonicalMount(output, "output", {
    mustExist: false,
  });
  if (!(await lstat(cachePath)).isDirectory())
    throw new Error("cache must be a primed npm directory");
  await assertPlainInputTree(cachePath);
  if (
    cachePath === outputPath ||
    cachePath.startsWith(`${outputPath}/`) ||
    outputPath.startsWith(`${cachePath}/`)
  ) {
    throw new Error("cache and output directories must be disjoint");
  }
  try {
    if ((await readdir(outputPath)).length)
      throw new Error("output must be an empty proof directory");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Inspect first: docker create uses this immutable local ID and never pulls.
  const imageRecord = JSON.parse(run("docker", ["image", "inspect", image]))[0];
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageRecord?.Id ?? ""))
    throw new Error("An existing local image ID is required");
  const manifest = JSON.parse(
    await readFile(join(SDK_ROOT, "package.json"), "utf8"),
  );
  const core = JSON.parse(
    await readFile(join(SDK_ROOT, "contracts/ui-1.0.0-package.json"), "utf8"),
  );
  const surface = JSON.parse(
    await readFile(
      join(SDK_ROOT, "contracts/astro-public-surface.json"),
      "utf8",
    ),
  );
  if (JSON.stringify(manifest.exports) !== JSON.stringify(surface.exports))
    throw new Error("Main public exports differ from the reviewed surface");
  const source = await readFile(
    join(FIXTURE_ROOT, "src/pages/index.astro"),
    "utf8",
  );
  const publicImports = validateConsumerFixture({ source, manifest });
  await mkdir(outputPath, { recursive: true });
  await mkdir(join(outputPath, "packing-cache"));
  await writeFile(
    join(outputPath, "image.json"),
    `${JSON.stringify(imageRecord, null, 2)}\n`,
  );
  const artifacts = {};
  const external = selected.some((name) =>
    ["external-plugin", "external-taxonomy"].includes(name),
  );
  for (const root of [
    SDK_ROOT,
    ...(external ? [join(REPO_ROOT, "tests/fixtures/external-plugin")] : []),
  ]) {
    const packageManifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    );
    const packed = JSON.parse(
      run(
        "npm",
        [
          "pack",
          "--ignore-scripts",
          "--pack-destination",
          outputPath,
          "--json",
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            npm_config_cache: join(outputPath, "packing-cache"),
            npm_config_offline: "true",
          },
        },
      ),
    )[0];
    const names = packed.files.map((file) => file.path).sort();
    if (
      root === SDK_ROOT &&
      JSON.stringify(names) !== JSON.stringify([...surface.files].sort())
    ) {
      throw new Error(
        "Main archive file inventory differs from the reviewed surface",
      );
    }
    const bytes = await readFile(join(outputPath, packed.filename));
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    if (packed.integrity !== integrity)
      throw new Error(
        "Actual archive integrity differs from npm pack metadata",
      );
    const hashes = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          sha256(await readFile(join(root, name))),
        ]),
      ),
    );
    artifacts[packageManifest.name] = {
      filename: packed.filename,
      sha256: sha256(bytes),
      integrity,
      manifest: packageManifest,
      files: hashes,
      pack_metadata: packed,
    };
  }
  await mkdir(join(outputPath, "template-locks"));
  const profiles = [];
  for (const name of selected) {
    const sourceRoot =
      name === "default"
        ? CONSUMER_ROOT
        : join(REPO_ROOT, "tests/fixtures", PACKED_PROFILES[name]);
    const directory = name === "default" ? "consumer" : name;
    const target = join(outputPath, directory);
    const names = await copyFixture(sourceRoot, target);
    for (const probe of [
      ...(!["ui-only", "not-found", "not-found-host"].includes(name)
        ? ["content-contract.json.ts"]
        : []),
      ...(!names.includes("src/pages/not-found-contract.json.ts")
        ? ["not-found-contract.json.ts"]
        : []),
      ...(name === "default" ? ["namespaces.json.ts"] : []),
    ]) {
      const path = `src/pages/${probe}`;
      if (names.includes(path))
        throw new Error(
          `${name}: certification probe would replace an authored route`,
        );
      await mkdir(join(target, "src/pages"), { recursive: true });
      await writeFile(
        join(target, path),
        await readFile(join(REPO_ROOT, "tests/fixtures/certification", probe)),
      );
      names.push(path);
    }
    const originalLock = await readFile(join(target, "package-lock.json"));
    await writeFile(
      join(outputPath, "template-locks", `${name}.json`),
      originalLock,
    );
    const lock = JSON.parse(originalLock);
    for (const [packageName, artifact] of Object.entries(artifacts)) {
      const local = lock.packages[`node_modules/${packageName}`];
      if (local) local.integrity = artifact.integrity;
    }
    const fixtureManifest = JSON.parse(
      await readFile(join(target, "package.json"), "utf8"),
    );
    validateProfileLock({
      manifest: fixtureManifest,
      lock,
      artifacts,
      core,
      profile: name,
    });
    await writeFile(
      join(target, "package-lock.json"),
      `${JSON.stringify(lock, null, 2)}\n`,
    );
    const authoredFiles = names.filter((path) => path !== "package-lock.json");
    const hashes = Object.fromEntries(
      await Promise.all(
        authoredFiles.map(async (path) => [
          path,
          sha256(await readFile(join(target, path))),
        ]),
      ),
    );
    profiles.push({
      name,
      fixture: PACKED_PROFILES[name],
      directory,
      authored_files: authoredFiles,
      authored_sha256: hashes,
      template_lock_sha256: sha256(originalLock),
    });
  }
  for (const name of [
    "run_packed_consumer.mjs",
    "packed_consumer_contracts.mjs",
  ]) {
    await writeFile(
      join(outputPath, name),
      await readFile(join(REPO_ROOT, "scripts", name)),
    );
  }
  const incompatible = JSON.parse(
    await readFile(
      join(REPO_ROOT, "tests/fixtures/incompatible-astro-peer.json"),
      "utf8",
    ),
  );
  const request = {
    schema_version: 2,
    selection: fixture,
    artifacts,
    core,
    surface,
    profiles,
    incompatible,
  };
  await writeFile(
    join(outputPath, "request.json"),
    `${JSON.stringify(request, null, 2)}\n`,
  );
  await assertPlainInputTree(outputPath);
  const id = run("docker", [
    "create",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,size=2g",
    "--mount",
    `type=bind,src=${outputPath},dst=/proof`,
    "--mount",
    `type=bind,src=${cachePath},dst=/cache,readonly`,
    "--workdir",
    "/proof",
    "--entrypoint",
    "node",
    imageRecord.Id,
    "/proof/run_packed_consumer.mjs",
    "/proof/request.json",
  ]).trim();
  const inspect = async (phase) => {
    const actual = JSON.parse(run("docker", ["inspect", id]));
    await writeFile(
      join(outputPath, `container-${phase}.json`),
      `${JSON.stringify(actual, null, 2)}\n`,
    );
    assertPackedContainer(actual[0], {
      image: imageRecord.Id,
      output: outputPath,
      cache: cachePath,
      workspace: await realpath(WORKSPACE_ROOT),
    });
    return actual[0];
  };
  await inspect("before");
  const execution = spawnSync("docker", ["start", "--attach", id], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  await writeFile(
    join(outputPath, "container-execution.log"),
    `${execution.stdout ?? ""}${execution.stderr ?? ""}${execution.error?.message ?? ""}`,
  );
  const after = await inspect("after");
  if (
    execution.error ||
    execution.status !== 0 ||
    after.State.Running ||
    after.State.ExitCode !== 0
  ) {
    throw new Error(
      `Isolated execution failed; retained ${join(outputPath, "container-execution.log")}`,
    );
  }
  await assertRetainedArtifacts(outputPath, artifacts);
  const result = JSON.parse(
    await readFile(join(outputPath, "runner-result.json"), "utf8"),
  );
  if (JSON.stringify(Object.keys(result.profiles)) !== JSON.stringify(selected))
    throw new Error("Runner result omits a selected profile");
  const proof = {
    schema_version: 2,
    selection: fixture,
    adapter: `${manifest.name}@${manifest.version}`,
    artifacts,
    profiles: result.profiles,
    runtime: result.runtime,
    incompatible_peer: result.incompatible_peer,
    public_source_imports: publicImports,
    container: {
      id,
      image: imageRecord.Id,
      network: "none",
      exit_code: after.State.ExitCode,
    },
    fixture_sources: profiles,
    certification: {
      independent_parent: "pending",
      browser_matrix: "pending",
      node_floor: "pending",
    },
  };
  await writeFile(
    join(outputPath, "proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`,
  );
  return proof;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let options;
  try {
    options = parsePackedArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
  }
  if (options) {
    verifyPackedConsumer(options)
      .then((proof) =>
        console.log(
          `Packed offline consumers: OK (${Object.keys(proof.profiles).length} profiles, ${proof.artifacts["@wpmoo/astro"].sha256}); final certification gates remain explicit`,
        ),
      )
      .catch((error) => {
        console.error(`Packed offline consumer: ${error.message}`);
        process.exitCode = 1;
      });
  }
}

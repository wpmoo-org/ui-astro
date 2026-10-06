#!/usr/bin/env node
// Copied to /proof: only retained inputs and exact installed packages are visible.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertStarterArchives,
  assertMinimalStarterSource,
  collectStarterOutput,
  digest,
  fileHashes,
  readJson,
  treeFiles,
  validateStarterLock,
} from "./astro_starter_contracts.mjs";

const writeJson = (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
async function step(directory, name, command, args, env) {
  const result = spawnSync(command, args, {
    cwd: directory,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`;
  const record = {
    command,
    args,
    exit_code: result.status,
    log: `${name}.log`,
    sha256: digest(output),
  };
  await writeFile(join(directory, record.log), output);
  assert.equal(
    result.status,
    0,
    `${directory}: ${name} failed; retained ${record.log}`,
  );
  return record;
}
async function resolution(directory, request) {
  const require = createRequire(join(directory, "package.json"));
  const host = await realpath(require.resolve("astro/package.json"));
  assert.equal(
    host,
    join(directory, "node_modules/astro/package.json"),
    "one local Astro host",
  );
  const packages = {};
  for (const [name, artifact] of Object.entries(request.artifacts)) {
    const root = dirname(require.resolve(`${name}/package.json`));
    assert.equal(
      await realpath(root),
      join(directory, `node_modules/${name}`),
      "no workspace/source package link",
    );
    assert.equal(
      await realpath(
        createRequire(join(root, "package.json")).resolve("astro/package.json"),
      ),
      host,
      "peer Astro host shared",
    );
    const names = await treeFiles(root);
    assert.deepEqual(
      names,
      Object.keys(artifact.files).sort(),
      `actual installed inventory: ${name}`,
    );
    const hashes = await fileHashes(root, names);
    assert.deepEqual(hashes, artifact.files, `actual installed bytes: ${name}`);
    const exports = {};
    for (const [key, target] of Object.entries(artifact.manifest.exports)) {
      const specifier = key === "." ? name : `${name}/${key.slice(2)}`;
      const resolved = require.resolve(specifier);
      assert.equal(
        resolved,
        join(root, typeof target === "string" ? target : target.default),
      );
      exports[specifier] = relative("/proof", resolved);
    }
    const privatePath = `${name}/src/types.js`;
    assert.throws(() => require.resolve(privatePath), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
    packages[name] = {
      version: artifact.manifest.version,
      root: relative("/proof", root),
      files: hashes,
      exports,
      private: {
        specifier: privatePath,
        code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
      },
    };
  }
  assert.throws(
    () => require.resolve("@wpmoo/astro-theme-starter/package.json"),
    { code: "MODULE_NOT_FOUND" },
  );
  const coreRoot = dirname(require.resolve("@wpmoo/ui/package.json"));
  const coreFiles = {};
  for (const [key, record] of Object.entries(request.core.exports)) {
    const path = require.resolve(`@wpmoo/ui/${key.slice(2)}`);
    assert.equal(path, join(coreRoot, record.target));
    coreFiles[key] = digest(await readFile(path));
    assert.equal(coreFiles[key], record.sha256, "published Core bytes");
  }
  const lock = await readJson(join(directory, "package-lock.json"));
  const closure = {};
  for (const [path, record] of Object.entries(lock.packages)) {
    if (!path) continue;
    try {
      const actual = await readJson(join(directory, path, "package.json"));
      assert.equal(
        actual.version,
        record.version,
        `installed closure version: ${path}`,
      );
      closure[path] = {
        version: actual.version,
        sha256: digest(await readFile(join(directory, path, "package.json"))),
      };
    } catch (error) {
      if (error.code !== "ENOENT" || !record.optional) throw error;
    }
  }
  return {
    host: relative("/proof", host),
    packages,
    core_files: coreFiles,
    closure,
  };
}

async function certify(
  profile,
  request,
  env,
  { generateLock = false, inset = "py-2" } = {},
) {
  const directory = join("/proof", profile.directory);
  const manifest = await readJson(join(directory, "package.json"));
  const before = await fileHashes(directory, profile.authored_files);
  assert.deepEqual(before, profile.authored_sha256, "prepared authored files");
  if (!generateLock)
    validateStarterLock(
      manifest,
      await readJson(join(directory, "package-lock.json")),
      request.artifacts,
    );
  const profileEnv = env;
  const commands = {};
  if (generateLock)
    commands.lock = await step(
      directory,
      "lock",
      "npm",
      [
        "install",
        "--package-lock-only",
        "--offline",
        "--strict-peer-deps",
        "--audit=false",
        "--fund=false",
      ],
      profileEnv,
    );
  validateStarterLock(
    manifest,
    await readJson(join(directory, "package-lock.json")),
    request.artifacts,
  );
  commands.install = await step(
    directory,
    "install",
    "npm",
    [
      "ci",
      "--offline",
      "--strict-peer-deps",
      "--ignore-scripts",
      "--audit=false",
      "--fund=false",
    ],
    profileEnv,
  );
  const installed = await resolution(directory, request);
  commands.check = await step(
    directory,
    "check",
    "npm",
    ["run", "check"],
    profileEnv,
  );
  commands.build = await step(
    directory,
    "build",
    "npm",
    ["run", "build"],
    profileEnv,
  );
  commands.tree = await step(
    directory,
    "tree",
    "npm",
    ["ls", "--all", "--json"],
    profileEnv,
  );
  if (profile.categoryProfile === "category") {
    commands.mdx = await step(
      directory,
      "mdx-development",
      "node",
      ["/proof/mdx-development-graph.mjs", directory, profile.mainLanguage],
      profileEnv,
    );
  }
  const output = await collectStarterOutput(directory, profile, inset);
  const after = await fileHashes(directory, profile.authored_files);
  assert.deepEqual(after, before, "authored source changed during build");
  assertMinimalStarterSource(profile.authored_files);
  for (const prefix of ["src"])
    assert.deepEqual(
      (await treeFiles(join(directory, prefix))).map(
        (name) => `${prefix}/${name}`,
      ),
      profile.authored_files.filter((name) => name.startsWith(`${prefix}/`)),
      "authored source inventory changed",
    );
  return {
    ...profile,
    inset,
    authored_before: before,
    authored_after: after,
    commands,
    installed,
    manifest_sha256: digest(await readFile(join(directory, "package.json"))),
    lock_sha256: digest(await readFile(join(directory, "package-lock.json"))),
    output,
  };
}

async function main() {
  assert.equal(
    dirname(fileURLToPath(import.meta.url)),
    "/proof",
    "runner must execute sealed inputs",
  );
  assert.equal(resolve(process.argv[2] ?? ""), "/proof/request.json");
  const request = await readJson("/proof/request.json");
  assert.equal(request.schema_version, 2);
  assert.equal(request.kind, "astro-moo-starter");
  assert.deepEqual(Object.keys(request.artifacts), ["@wpmoo/astro"]);
  await assertStarterArchives("/proof", request.artifacts);
  assert.deepEqual(
    await fileHashes("/proof", Object.keys(request.scripts_sha256)),
    request.scripts_sha256,
    "retained runner inputs",
  );
  assert.deepEqual(
    await fileHashes("/proof/source", Object.keys(request.source_sha256)),
    request.source_sha256,
    "original portable source snapshot",
  );
  await cp("/cache", "/tmp/npm-cache", { recursive: true });
  const env = {
    ...process.env,
    npm_config_cache: "/tmp/npm-cache",
    npm_config_offline: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    ASTRO_TELEMETRY_DISABLED: "1",
  };
  const proof = {
    schema_version: 2,
    kind: "astro-moo-starter",
    artifacts: request.artifacts,
    source_commit: request.source_commit,
    starter_commit: request.starter_commit,
    source_sha256: request.source_sha256,
    runtime: {
      node: process.version,
      npm: spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout.trim(),
      platform: process.platform,
      architecture: process.arch,
    },
    profiles: {},
    acceptance: {
      http_status: "not-executed",
      static_host_selection: "not-executed",
      rendered: "pending",
    },
  };
  for (const profile of request.profiles) {
    const record = await certify(profile, request, env, { generateLock: true });
    proof.profiles[profile.name] = record;
    await writeJson("/proof/proof.json", proof);
    console.log(
      `${profile.name}: ${Object.keys(record.output.html).length} compiled pages, strict check/build/closure passed`,
    );
  }
}
await main();

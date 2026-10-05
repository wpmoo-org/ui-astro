#!/usr/bin/env node
// Copied to /proof: only retained inputs and exact installed packages are visible.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPilotArchives,
  collectPilotOutput,
  digest,
  fileHashes,
  readJson,
  treeFiles,
  validatePilotLock,
} from "./theme_pilot_contracts.mjs";

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
    validatePilotLock(
      manifest,
      await readJson(join(directory, "package-lock.json")),
      request.artifacts,
    );
  const profileEnv = {
    ...env,
    PILOT_MAIN_LANGUAGE: profile.mainLanguage,
    PILOT_CATEGORY_PROFILE: profile.categoryProfile,
  };
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
  validatePilotLock(
    manifest,
    await readJson(join(directory, "package-lock.json")),
    request.artifacts,
  );
  commands.install = await step(
    directory,
    "install",
    "npm",
    ["ci", "--offline", "--strict-peer-deps", "--audit=false", "--fund=false"],
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
  const output = await collectPilotOutput(directory, profile, inset);
  const after = await fileHashes(directory, profile.authored_files);
  assert.deepEqual(after, before, "authored source changed during build");
  for (const prefix of ["src", "routes"])
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
  await assertPilotArchives("/proof", { update: request.update_artifact });
  await assertPilotArchives("/proof", request.artifacts);
  assert.deepEqual(
    await fileHashes("/proof", Object.keys(request.scripts_sha256)),
    request.scripts_sha256,
    "retained runner inputs",
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
    schema_version: 1,
    artifacts: request.artifacts,
    update_artifact: request.update_artifact,
    updates: {},
    source_commit: request.source_commit,
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
  for (const rehearsal of request.rehearsals) {
    const directory = join("/proof", rehearsal.directory);
    const originalManifest = await readFile(join(directory, "package.json"));
    const originalLock = await readFile(join(directory, "package-lock.json"));
    const phases = {};
    for (const phase of ["baseline", "updated", "rolled-back"]) {
      const artifacts = { ...request.artifacts };
      if (phase === "updated") {
        artifacts["@wpmoo/astro-theme-starter"] = request.update_artifact;
        const manifest = JSON.parse(originalManifest);
        manifest.dependencies["@wpmoo/astro-theme-starter"] =
          `file:../${request.update_artifact.filename}`;
        await writeJson(join(directory, "package.json"), manifest);
      } else if (phase === "rolled-back") {
        await writeFile(join(directory, "package.json"), originalManifest);
        await writeFile(join(directory, "package-lock.json"), originalLock);
      }
      const inset =
        rehearsal.mode === "normal"
          ? "py-2"
          : phase === "updated"
            ? "py-4"
            : "py-3";
      const phaseRequest = { ...request, artifacts };
      const record = await certify(rehearsal, phaseRequest, env, {
        generateLock: phase === "updated",
        inset,
      });
      const snapshotName = `${rehearsal.directory}-${phase}`;
      const snapshot = join("/proof", snapshotName);
      await cp(directory, snapshot, { recursive: true });
      record.executed_directory = rehearsal.directory;
      record.directory = snapshotName;
      record.phase = phase;
      record.installed = await resolution(snapshot, phaseRequest);
      phases[phase] = record;
      if (phase !== "baseline") {
        assert.deepEqual(
          record.authored_after,
          phases.baseline.authored_before,
          "update changed authored bytes",
        );
        const urls = (output) =>
          Object.fromEntries(
            Object.entries(output.observations).map(
              ([name, { inset, ...values }]) => [name, values],
            ),
          );
        assert.deepEqual(
          urls(record.output),
          urls(phases.baseline.output),
          "update changed complete URL observations",
        );
      }
      if (phase === "rolled-back") {
        assert.equal(
          record.manifest_sha256,
          digest(originalManifest),
          "exact manifest rollback",
        );
        assert.equal(
          record.lock_sha256,
          digest(originalLock),
          "exact lock rollback",
        );
        assert.deepEqual(
          record.output,
          phases.baseline.output,
          "exact compiled rollback output",
        );
      }
      console.log(
        `${rehearsal.mode}/${phase}: retained full installed snapshot, authored bytes/URLs preserved, ${inset}`,
      );
    }
    proof.updates[rehearsal.mode] = {
      working_directory: rehearsal.directory,
      phases,
    };
    await writeJson("/proof/proof.json", proof);
  }
  await assertPilotArchives("/proof", { update: request.update_artifact });
  await assertPilotArchives("/proof", request.artifacts);
  await writeJson("/proof/proof.json", proof);
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

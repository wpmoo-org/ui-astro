#!/usr/bin/env node

// This runner is copied beside the archives. It has no checkout or tool dependency.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertConsumerOutput,
  assertPackedPageOutput,
  assertThemeOutput,
  assertPeerConflict,
  validateProfileLock,
} from "./packed_consumer_contracts.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

async function hashes(root, names) {
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        sha256(await readFile(join(root, name))),
      ]),
    ),
  );
}

async function files(root) {
  const result = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`authored source symlink is forbidden: ${full}`);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push(relative(root, full));
      else throw new Error(`unexpected authored file kind: ${full}`);
    }
  }
  await visit(root);
  return result.sort();
}

function step(directory, name, command, args, env) {
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
    sha256: sha256(output),
  };
  return writeFile(join(directory, record.log), output).then(() => {
    if (result.error || result.status !== 0)
      throw new Error(
        `${relative("/proof", directory)}: ${name} failed; retained ${record.log}`,
      );
    return record;
  });
}

async function resolution(directory, request) {
  const require = createRequire(join(directory, "package.json"));
  const host = await realpath(require.resolve("astro/package.json"));
  const adapterRoot = dirname(require.resolve("@wpmoo/astro/package.json"));
  const adapterHost = await realpath(
    createRequire(join(adapterRoot, "package.json")).resolve(
      "astro/package.json",
    ),
  );
  assert.equal(
    host,
    adapterHost,
    "The package must use the one actual consumer Astro host",
  );
  assert.equal(host, join(directory, "node_modules/astro/package.json"));
  const upstreamRoot = dirname(require.resolve("@wpmoo/ui/package.json"));
  const upstreamFiles = {};
  for (const [specifier, entry] of Object.entries(request.core.exports)) {
    const path = require.resolve(
      `${request.core.package}/${specifier.slice(2)}`,
    );
    assert.equal(path, join(upstreamRoot, entry.target));
    const hash = sha256(await readFile(path));
    assert.equal(
      hash,
      entry.sha256,
      `Published Core release bytes differ: ${specifier}`,
    );
    upstreamFiles[specifier] = hash;
  }
  const publicRecords = {};
  const privateRecords = {};
  for (const [name, artifact] of Object.entries(request.artifacts)) {
    if (
      name !== "@wpmoo/astro" &&
      !(await readJson(join(directory, "package.json"))).dependencies?.[name]
    )
      continue;
    const installed = join(directory, "node_modules", name);
    assert.deepEqual(
      await files(installed),
      Object.keys(artifact.files).sort(),
      `${name}: actual installed archive inventory differs`,
    );
    assert.deepEqual(
      await hashes(installed, Object.keys(artifact.files)),
      artifact.files,
      `${name}: actual installed archive bytes differ`,
    );
    for (const [key, value] of Object.entries(artifact.manifest.exports)) {
      const specifier = key === "." ? name : `${name}/${key.slice(2)}`;
      const target = typeof value === "string" ? value : value.default;
      const resolved = require.resolve(specifier);
      assert.equal(resolved, join(directory, "node_modules", name, target));
      publicRecords[specifier] = relative("/proof", resolved);
    }
    const privatePaths =
      name === "@wpmoo/astro"
        ? request.surface.private_transitives
        : [
            "index.js",
            "package.json",
            "routes/index.astro",
            "routes/[...slug].astro",
          ];
    for (const path of privatePaths) {
      const specifier = `${name}/${path}`;
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import.meta.resolve(${JSON.stringify(specifier)})`,
        ],
        { cwd: directory, encoding: "utf8" },
      );
      assert.notEqual(
        result.status,
        0,
        `Private import succeeded: ${specifier}`,
      );
      assert.match(
        result.stderr,
        /ERR_PACKAGE_PATH_NOT_EXPORTED/,
        `Private import failed for the wrong reason: ${specifier}`,
      );
      privateRecords[specifier] = {
        exit_code: result.status,
        code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
      };
    }
  }
  const record = {
    public: publicRecords,
    private: privateRecords,
    upstream_files: upstreamFiles,
    host_astro_path: relative("/proof", host),
    adapter_astro_path: relative("/proof", adapterHost),
  };
  await writeJson(join(directory, "resolution.json"), record);
  return record;
}

async function main() {
  if (
    resolve(process.argv[2] ?? "") !== "/proof/request.json" ||
    dirname(fileURLToPath(import.meta.url)) !== "/proof"
  ) {
    throw new Error(
      "The isolated runner must execute from its prepared /proof directory",
    );
  }
  const request = await readJson("/proof/request.json");
  for (const artifact of Object.values(request.artifacts)) {
    assert.equal(
      sha256(await readFile(join("/proof", artifact.filename))),
      artifact.sha256,
      "Retained archive changed before execution",
    );
  }
  await cp("/cache", "/tmp/npm-cache", { recursive: true });
  const env = {
    ...process.env,
    npm_config_cache: "/tmp/npm-cache",
    npm_config_offline: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    ASTRO_TELEMETRY_DISABLED: "1",
  };
  const result = {
    runtime: {
      node: process.version,
      npm: spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout.trim(),
      platform: process.platform,
      architecture: process.arch,
    },
    profiles: {},
  };
  await writeJson("/proof/runtime.json", result.runtime);
  for (const profile of request.profiles) {
    const directory = join("/proof", profile.directory);
    const manifest = await readJson(join(directory, "package.json"));
    const before = await hashes(directory, profile.authored_files);
    assert.deepEqual(
      before,
      profile.authored_sha256,
      `${profile.name}: prepared source bytes differ`,
    );
    const sourceBefore = await files(join(directory, "src"));
    const steps = {};
    const args = {
      manifest,
      lock: await readJson(join(directory, "package-lock.json")),
      artifacts: request.artifacts,
      core: request.core,
      profile: profile.name,
    };
    validateProfileLock(args);
    steps.lock = await step(
      directory,
      "prepare-lock",
      "npm",
      [
        "install",
        "--package-lock-only",
        "--offline",
        "--strict-peer-deps",
        "--audit=false",
        "--fund=false",
      ],
      env,
    );
    args.lock = await readJson(join(directory, "package-lock.json"));
    validateProfileLock(args);
    steps.install = await step(
      directory,
      "install",
      "npm",
      [
        "ci",
        "--offline",
        "--strict-peer-deps",
        "--audit=false",
        "--fund=false",
      ],
      env,
    );
    const resolved = await resolution(directory, request);
    steps.check = await step(directory, "check", "npm", ["run", "check"], env);
    steps.build = await step(directory, "build", "npm", ["run", "build"], env);
    if (profile.authored_files.includes("verify.mjs"))
      steps.pure = await step(
        directory,
        "pure-api",
        process.execPath,
        ["verify.mjs"],
        env,
      );
    steps.tree = await step(
      directory,
      "tree",
      "npm",
      ["ls", "--all", "--json"],
      env,
    );
    const distFiles = await files(join(directory, "dist"));
    const html = await hashes(
      join(directory, "dist"),
      distFiles.filter((path) => path.endsWith(".html")),
    );
    const after = await hashes(directory, profile.authored_files);
    assert.deepEqual(
      before,
      after,
      `${profile.name}: authored files changed during install/check/build`,
    );
    assert.deepEqual(
      sourceBefore,
      await files(join(directory, "src")),
      `${profile.name}: authored source inventory changed`,
    );
    if (profile.name === "default") {
      const home = await readFile(join(directory, "dist/index.html"), "utf8");
      const contact = await readFile(
        join(directory, "dist/contact/index.html"),
        "utf8",
      );
      const guide = await readFile(
        join(directory, "dist/guide/setup/index.html"),
        "utf8",
      );
      assertConsumerOutput(home);
      assertPackedPageOutput({
        contact,
        guide,
        draftExists: distFiles.includes("draft/index.html"),
      });
      assertThemeOutput({ home, contact, guide });
    }
    result.profiles[profile.name] = {
      directory: profile.directory,
      archive_sha256: request.artifacts["@wpmoo/astro"].sha256,
      authored_before: before,
      authored_after: after,
      source_files: sourceBefore,
      execution_lock_sha256: sha256(
        await readFile(join(directory, "package-lock.json")),
      ),
      host_astro: args.lock.packages["node_modules/astro"].version,
      mdx_installed: Object.hasOwn(
        args.lock.packages,
        "node_modules/@astrojs/mdx",
      ),
      html,
      dist: await hashes(join(directory, "dist"), distFiles),
      steps,
      public_resolution_count: Object.keys(resolved.public).length,
      private_errors: resolved.private,
    };
    await writeJson("/proof/runner-result.json", result);
    console.log(
      `${profile.name}: offline install, check, build and public boundary passed`,
    );
  }
  await mkdir("/proof/peer-conflict");
  const manifest = structuredClone(
    await readJson(
      join("/proof", request.profiles[0].directory, "package.json"),
    ),
  );
  const lock = structuredClone(
    await readJson(
      join("/proof", request.profiles[0].directory, "package-lock.json"),
    ),
  );
  manifest.dependencies.astro = request.incompatible.version;
  lock.packages[""].dependencies.astro = request.incompatible.version;
  lock.packages["node_modules/astro"] = request.incompatible;
  await writeJson("/proof/peer-conflict/package.json", manifest);
  await writeJson("/proof/peer-conflict/package-lock.json", lock);
  const peer = spawnSync(
    "npm",
    ["ci", "--offline", "--strict-peer-deps", "--audit=false", "--fund=false"],
    { cwd: "/proof/peer-conflict", env, encoding: "utf8" },
  );
  assertPeerConflict(
    peer,
    request.artifacts["@wpmoo/astro"].manifest.peerDependencies.astro,
  );
  await writeFile("/proof/peer-conflict.log", `${peer.stdout}${peer.stderr}`);
  result.incompatible_peer = {
    exit_code: peer.status,
    code: "ERESOLVE",
    host_version: request.incompatible.version,
  };
  await writeJson("/proof/runner-result.json", result);
}

main().catch(async (error) => {
  console.error(error.stack ?? error.message);
  await writeJson("/proof/runner-failure.json", { error: error.message }).catch(
    () => {},
  );
  process.exitCode = 1;
});

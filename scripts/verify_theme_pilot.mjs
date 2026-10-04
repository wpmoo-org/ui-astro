#!/usr/bin/env node
import assert from "node:assert/strict";
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
import { fileURLToPath } from "node:url";
import {
  assertPackedContainer,
  assertPlainInputTree,
} from "./packed_consumer_contracts.mjs";
import {
  assertPilotArchives,
  digest,
  fileHashes,
  readJson,
  validatePilotLock,
} from "./theme_pilot_contracts.mjs";
export { assertPlainInputTree };

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = resolve(REPO, "../../..");
const SITE = join(REPO, "apps/theme-pilot");
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("../") && !isAbsolute(path));
};
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`,
    );
  return result.stdout;
}
async function canonical(path, mustExist) {
  assert.ok(isAbsolute(path), "absolute proof/cache paths required");
  let current = resolve(path);
  const missing = [];
  for (;;) {
    try {
      const found = await realpath(current);
      assert.equal(found, current, "symlinked proof/cache ancestor forbidden");
      assert.ok(
        !mustExist || missing.length === 0,
        "existing primed cache required",
      );
      return join(found, ...missing.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(basename(current));
      current = dirname(current);
    }
  }
}
export async function assertPilotLocations({ cache, output }) {
  const cachePath = await canonical(cache, true);
  const outputPath = await canonical(output, false);
  for (const path of [cachePath, outputPath])
    assert.ok(
      !inside(WORKSPACE, path) && !inside(path, WORKSPACE),
      "proof/cache must be outside workspace",
    );
  assert.ok(
    !inside(cachePath, outputPath) && !inside(outputPath, cachePath),
    "proof/cache must be disjoint",
  );
  assert.ok(
    (await lstat(cachePath)).isDirectory(),
    "primed cache directory required",
  );
  await assertPlainInputTree(cachePath);
  try {
    assert.equal((await readdir(outputPath)).length, 0, "output must be empty");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { cachePath, outputPath };
}
async function copySource(source, target) {
  const names = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        ["node_modules", ".astro", "dist", ".cache", ".vite", ".git"].includes(
          entry.name,
        )
      )
        continue;
      assert.ok(
        !entry.isSymbolicLink(),
        `authored source symlink: ${entry.name}`,
      );
      const full = join(directory, entry.name);
      const name = relative(source, full);
      if (entry.isDirectory()) await visit(full);
      else {
        assert.ok(entry.isFile(), `unsupported source: ${name}`);
        await mkdir(dirname(join(target, name)), { recursive: true });
        await writeFile(join(target, name), await readFile(full));
        names.push(name);
      }
    }
  }
  await visit(source);
  return names.sort();
}
export async function archiveRecord(path) {
  assert.ok(
    !(await lstat(path)).isSymbolicLink(),
    "archive cannot be a symlink",
  );
  const members = run("tar", ["-tzf", path]).trim().split("\n");
  const files = {};
  for (const name of members) {
    assert.ok(
      name.startsWith("package/") &&
        name.split("/").every((part) => part !== ".." && part !== ".") &&
        !name.endsWith("/"),
      `invalid archive member: ${name}`,
    );
    assert.ok(
      !Object.hasOwn(files, name.slice(8)),
      `duplicate archive member: ${name}`,
    );
    const literal = name.replace(
      /[\\*?\[\]]/gu,
      (character) => `\\${character}`,
    );
    const result = spawnSync("tar", ["-xOf", path, literal], {
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `unreadable archive member: ${name}`);
    files[name.slice(8)] = digest(result.stdout);
  }
  assert.ok(
    run("tar", ["-tvzf", path])
      .trim()
      .split("\n")
      .every((line) => line.startsWith("-")),
    "archive must contain only regular files",
  );
  const manifest = JSON.parse(
    run("tar", ["-xOf", path, "package/package.json"]),
  );
  const bytes = await readFile(path);
  return {
    filename: basename(path),
    sha256: digest(bytes),
    integrity: `sha512-${digest(bytes, "sha512", "base64")}`,
    manifest,
    files,
  };
}
export async function verifyThemePilot(options) {
  const { cachePath, outputPath } = await assertPilotLocations(options);
  assert.match(
    options.image,
    /^sha256:[a-f0-9]{64}$/u,
    "existing immutable image ID required",
  );
  const image = JSON.parse(
    run("docker", ["image", "inspect", options.image]),
  )[0];
  assert.equal(image.Id, options.image);
  const manifest = await readJson(join(SITE, "package.json"));
  const templateLock = await readJson(join(SITE, "package-lock.json"));
  const artifacts = {};
  await mkdir(outputPath, { recursive: true });
  for (const name of ["@wpmoo/astro", "@wpmoo/astro-theme-pilot"]) {
    const original = resolve(SITE, manifest.dependencies[name].slice(5));
    const record = await archiveRecord(original);
    assert.equal(
      record.integrity,
      templateLock.packages[`node_modules/${name}`].integrity,
      `archive differs from authored lock: ${name}`,
    );
    if (name === "@wpmoo/astro")
      assert.equal(
        record.sha256,
        "03b3a082a90681a1ebf8c3d3a5ae03dee0bae8146a3430e07b21a3ead61b8141",
        "foundation checkpoint changed",
      );
    artifacts[name] = record;
    await writeFile(
      join(outputPath, record.filename),
      await readFile(original),
    );
  }
  const profiles = [];
  for (const categoryProfile of ["category", "short", "root"]) {
    for (const mainLanguage of ["en", "de"]) {
      const name = `${mainLanguage}-${categoryProfile}`;
      const directory = join(outputPath, name);
      const names = await copySource(SITE, directory);
      const localManifest = structuredClone(manifest);
      const localLock = structuredClone(templateLock);
      for (const [packageName, artifact] of Object.entries(artifacts)) {
        const value = `file:../${artifact.filename}`;
        localManifest.dependencies[packageName] = value;
        localLock.packages[""].dependencies[packageName] = value;
        localLock.packages[`node_modules/${packageName}`].resolved = value;
      }
      validatePilotLock(localManifest, localLock, artifacts);
      for (const [filename, value] of [
        ["package.json", localManifest],
        ["package-lock.json", localLock],
      ])
        await writeFile(
          join(directory, filename),
          `${JSON.stringify(value, null, 2)}\n`,
        );
      const authoredFiles = names.filter(
        (value) => !["package.json", "package-lock.json"].includes(value),
      );
      profiles.push({
        name,
        directory: name,
        mainLanguage,
        categoryProfile,
        authored_files: authoredFiles,
        authored_sha256: await fileHashes(directory, authoredFiles),
      });
    }
  }
  const updateArtifact = await archiveRecord(
    join(REPO, "artifacts/theme-pilot/wpmoo-astro-theme-pilot-0.1.1.tgz"),
  );
  assert.equal(updateArtifact.manifest.version, "0.1.1");
  assert.notEqual(
    updateArtifact.filename,
    artifacts["@wpmoo/astro-theme-pilot"].filename,
  );
  assert.deepEqual(
    Object.keys(updateArtifact.files).sort(),
    Object.keys(artifacts["@wpmoo/astro-theme-pilot"].files).sort(),
    "compatible theme archive inventory",
  );
  assert.deepEqual(
    Object.keys(updateArtifact.files)
      .filter(
        (name) =>
          updateArtifact.files[name] !==
          artifacts["@wpmoo/astro-theme-pilot"].files[name],
      )
      .sort(),
    ["package.json", "src/preferences.js"],
    "this rehearsal changes only version and fallback",
  );
  await writeFile(
    join(outputPath, updateArtifact.filename),
    await readFile(
      join(REPO, "artifacts/theme-pilot", updateArtifact.filename),
    ),
  );
  const rehearsals = [];
  for (const mode of ["normal", "inherited"]) {
    const name = `update-${mode}`;
    const directory = join(outputPath, name);
    const baseline = profiles.find((profile) => profile.name === "en-category");
    for (const filename of [
      ...baseline.authored_files,
      "package.json",
      "package-lock.json",
    ]) {
      await mkdir(dirname(join(directory, filename)), { recursive: true });
      await writeFile(
        join(directory, filename),
        await readFile(join(outputPath, baseline.directory, filename)),
      );
    }
    if (mode === "inherited")
      await writeFile(
        join(directory, "src/preferences.js"),
        '/** @type {import("@wpmoo/astro/config").PageOptionsInput} */\nexport const projectDefaults = {};\n',
      );
    rehearsals.push({
      ...baseline,
      name,
      directory: name,
      mode,
      authored_sha256: await fileHashes(directory, baseline.authored_files),
    });
  }
  for (const [source, target] of [
    ["run_theme_pilot.mjs", "run_packed_consumer.mjs"],
    ["theme_pilot_contracts.mjs", "theme_pilot_contracts.mjs"],
  ])
    await writeFile(
      join(outputPath, target),
      await readFile(join(REPO, "scripts", source)),
    );
  const request = {
    schema_version: 1,
    artifacts,
    update_artifact: updateArtifact,
    rehearsals,
    profiles,
    core: await readJson(
      join(REPO, "packages/astro/contracts/ui-1.0.0-package.json"),
    ),
    source_commit: run("git", ["rev-parse", "HEAD"], { cwd: REPO }).trim(),
    scripts_sha256: await fileHashes(outputPath, [
      "run_packed_consumer.mjs",
      "theme_pilot_contracts.mjs",
    ]),
  };
  await writeFile(
    join(outputPath, "request.json"),
    `${JSON.stringify(request, null, 2)}\n`,
  );
  await writeFile(
    join(outputPath, "image.json"),
    `${JSON.stringify(image, null, 2)}\n`,
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
    image.Id,
    "/proof/run_packed_consumer.mjs",
    "/proof/request.json",
  ]).trim();
  async function inspect(phase) {
    const records = JSON.parse(run("docker", ["inspect", id]));
    await writeFile(
      join(outputPath, `container-${phase}.json`),
      `${JSON.stringify(records, null, 2)}\n`,
    );
    assertPackedContainer(records[0], {
      image: image.Id,
      output: outputPath,
      cache: cachePath,
      workspace: WORKSPACE,
    });
    return records[0];
  }
  await inspect("before");
  const result = spawnSync("docker", ["start", "--attach", id], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  await writeFile(
    join(outputPath, "container-execution.log"),
    `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  );
  const after = await inspect("after");
  assert.equal(
    result.status,
    0,
    `isolated execution failed; inspect ${outputPath}/container-execution.log`,
  );
  assert.equal(after.State.ExitCode, 0);
  assert.equal(after.State.Running, false);
  await assertPilotArchives(outputPath, artifacts);
  await assertPilotArchives(outputPath, { update: updateArtifact });
  const proof = await readJson(join(outputPath, "proof.json"));
  proof.container = {
    id,
    image: image.Id,
    exit_code: after.State.ExitCode,
    network: "none",
  };
  await writeFile(
    join(outputPath, "proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`,
  );
  return proof;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = {};
  const args = process.argv.slice(2);
  try {
    for (let index = 0; index < args.length; index += 2) {
      assert.ok(
        ["--cache", "--output", "--image"].includes(args[index]),
        "unknown argument",
      );
      const key = args[index].slice(2);
      assert.ok(!options[key] && args[index + 1], "missing/duplicate argument");
      options[key] = args[index + 1];
    }
    assert.equal(Object.keys(options).length, 3, "cache/output/image required");
    await verifyThemePilot(options);
    console.log(
      "Packed theme pilot: six profiles passed; runtime/visual acceptance remains open.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import assert from "node:assert/strict";
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
import { fileURLToPath, pathToFileURL } from "node:url";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
const inside = (parent, child) => {
  const path = relative(parent, child);
  return (
    path === "" ||
    (path !== ".." &&
      !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      !isAbsolute(path))
  );
};
async function canonical(path) {
  assert.ok(isAbsolute(path), "absolute preparation paths required");
  let current = resolve(path);
  const missing = [];
  while (true) {
    try {
      return join(await realpath(current), ...missing.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(basename(current));
      current = dirname(current);
    }
  }
}
function tar(args, encoding = "utf8") {
  const result = spawnSync("tar", args, {
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `archive read failed: ${result.stderr}`);
  return result.stdout;
}
export async function archiveRecord(path) {
  assert.equal(
    (await lstat(path)).isSymbolicLink(),
    false,
    "archive cannot be a symlink",
  );
  const members = tar(["-tzf", path]).trim().split("\n");
  const literalNames = tar(["--version"]).includes("GNU tar");
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
    const literal = literalNames
      ? name
      : name.replace(/[\\*?\[\]]/gu, (character) => `\\${character}`);
    files[name.slice(8)] = digest(tar(["-xOf", path, literal], null));
  }
  assert.ok(
    tar(["-tvzf", path])
      .trim()
      .split("\n")
      .every((line) => line.startsWith("-")),
    "archive must contain only regular files",
  );
  const manifest = JSON.parse(tar(["-xOf", path, "package/package.json"]));
  const bytes = await readFile(path);
  return {
    filename: basename(path),
    sha256: digest(bytes),
    integrity: `sha512-${digest(bytes, "sha512", "base64")}`,
    manifest,
    files,
  };
}
async function sourceFiles(root) {
  assert.equal(
    (await lstat(root)).isSymbolicLink(),
    false,
    "source symlink forbidden",
  );
  const names = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        [
          "node_modules",
          ".git",
          ".astro",
          "dist",
          ".cache",
          ".vite",
          ".DS_Store",
        ].includes(entry.name) ||
        (entry.name.startsWith(".env") && entry.name !== ".env.example")
      )
        continue;
      const path = join(directory, entry.name);
      assert.equal(
        entry.isSymbolicLink(),
        false,
        `source symlink forbidden: ${path}`,
      );
      if (entry.isDirectory()) await visit(path);
      else {
        assert.ok(entry.isFile(), `unsupported source file: ${path}`);
        names.push(relative(root, path));
      }
    }
  }
  await visit(root);
  return names.sort();
}
export async function prepareAstroStarter({
  starterPath,
  sdkArchive,
  outputPath,
  lockPath,
}) {
  const names = await sourceFiles(starterPath);
  const sourcePath = await canonical(starterPath);
  const targetPath = await canonical(outputPath);
  for (const owner of [sourcePath, sdkRoot])
    assert.ok(
      !inside(owner, targetPath) && !inside(targetPath, owner),
      "source/SDK/output paths must be disjoint",
    );
  try {
    assert.equal((await readdir(targetPath)).length, 0, "output must be empty");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const manifest = JSON.parse(
    await readFile(join(sourcePath, "package.json"), "utf8"),
  );
  assert.equal(
    manifest.dependencies?.["@wpmoo/astro"],
    "0.1.0",
    "portable SDK dependency must be 0.1.0",
  );
  assert.ok(
    !manifest.dependencies?.["@wpmoo/astro-theme-starter"],
    "direct starter cannot depend on a theme package",
  );
  const sdk = await archiveRecord(sdkArchive);
  assert.equal(
    sdk.manifest.name,
    "@wpmoo/astro",
    "SDK archive package name differs",
  );
  assert.equal(
    sdk.manifest.version,
    "0.1.0",
    "SDK version differs from the selected dependency",
  );
  assert.ok(sdk.filename.endsWith(".tgz"), "SDK tarball filename required");
  // Use npm's standard artifact name regardless of the selected input basename.
  sdk.filename = `wpmoo-astro-${sdk.manifest.version}.tgz`;
  let lock;
  if (lockPath) {
    assert.ok(isAbsolute(lockPath), "absolute lock seed path required");
    assert.equal(
      (await lstat(lockPath)).isSymbolicLink(),
      false,
      "lock seed cannot be a symlink",
    );
    lock = JSON.parse(await readFile(lockPath, "utf8"));
    assert.equal(lock.lockfileVersion, 3, "lock seed version differs");
    assert.ok(
      !lock.packages["node_modules/@wpmoo/astro-theme-starter"],
      "lock seed cannot contain a theme package",
    );
    assert.equal(
      lock.packages["node_modules/@wpmoo/astro"]?.integrity,
      sdk.integrity,
      "lock seed SDK integrity differs",
    );
    lock.name = manifest.name;
    lock.version = manifest.version;
    lock.packages[""] = Object.fromEntries(
      [
        "name",
        "version",
        "license",
        "dependencies",
        "devDependencies",
        "engines",
      ]
        .filter((key) => manifest[key] !== undefined)
        .map((key) => [key, structuredClone(manifest[key])]),
    );
    lock.packages[""].dependencies["@wpmoo/astro"] = `file:../${sdk.filename}`;
    lock.packages["node_modules/@wpmoo/astro"].resolved =
      `file:../${sdk.filename}`;
  }
  const sitePath = join(targetPath, "site");
  const archivePath = join(targetPath, sdk.filename);
  const sourceHashes = {};
  for (const name of names) {
    const bytes = await readFile(join(sourcePath, name));
    sourceHashes[name] = digest(bytes);
    for (const destination of [
      join(targetPath, "source", name),
      join(sitePath, name),
    ]) {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
  }
  await writeFile(archivePath, await readFile(sdkArchive));
  manifest.dependencies["@wpmoo/astro"] = `file:../${sdk.filename}`;
  await writeFile(
    join(sitePath, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  if (lock)
    await writeFile(
      join(sitePath, "package-lock.json"),
      `${JSON.stringify(lock, null, 2)}\n`,
    );
  return { sitePath, archivePath, sourceHashes, sdk };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const allowed = new Map([
    ["--starter", "starterPath"],
    ["--sdk", "sdkArchive"],
    ["--output", "outputPath"],
    ["--lock", "lockPath"],
  ]);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(
      allowed.has(args[i]) && args[i + 1],
      "usage: --starter <absolute-path> --sdk <absolute-tgz> --output <empty-external-path>",
    );
    assert.ok(
      !Object.hasOwn(options, allowed.get(args[i])),
      `duplicate option: ${args[i]}`,
    );
    options[allowed.get(args[i])] = args[i + 1];
  }
  assert.ok(
    options.starterPath && options.sdkArchive && options.outputPath,
    "starter, SDK and output required",
  );
  const result = await prepareAstroStarter(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

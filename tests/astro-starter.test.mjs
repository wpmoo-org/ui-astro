import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(t, name = "source", version = "0.1.0") {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "astro-starter-test-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const starterPath = join(root, name);
  const outputPath = join(root, "prepared output");
  await mkdir(join(starterPath, "src"), { recursive: true });
  const manifest =
    JSON.stringify(
      {
        name: "astro-moo-starter",
        private: true,
        type: "module",
        dependencies: { "@wpmoo/astro": "0.1.0", astro: "7.3.3" },
      },
      null,
      2,
    ) + "\n";
  await writeFile(join(starterPath, "package.json"), manifest);
  await writeFile(
    join(starterPath, "src", "contact.md"),
    "Authored Contact edit.\n",
  );
  await mkdir(join(starterPath, "node_modules"));
  await writeFile(
    join(starterPath, "node_modules", "generated"),
    "not authored",
  );
  const packageRoot = join(root, "archive", "package");
  await mkdir(join(packageRoot, "src"), { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@wpmoo/astro",
      version,
      exports: { ".": "./src/[...slug].astro" },
    }),
  );
  await writeFile(join(packageRoot, "src", "[...slug].astro"), "<slot />\n");
  const sdkArchive = join(root, "wpmoo-astro-0.1.0.tgz");
  const tar = spawnSync(
    "tar",
    [
      "-czf",
      sdkArchive,
      "-C",
      join(root, "archive"),
      "package/package.json",
      "package/src/[...slug].astro",
    ],
    { encoding: "utf8" },
  );
  assert.equal(tar.status, 0, tar.stderr);
  const sourceHashes = {
    "package.json": hash(manifest),
    "src/contact.md": hash("Authored Contact edit.\n"),
  };
  return { root, starterPath, outputPath, sdkArchive, manifest, sourceHashes };
}
async function prepare(options) {
  const module = await import("../scripts/prepare_astro_starter.mjs");
  return module.prepareAstroStarter(options);
}

test("portable_source_stays_unchanged", async (t) => {
  const input = await fixture(t);
  const result = await prepare(input);
  assert.equal(
    await readFile(join(input.starterPath, "package.json"), "utf8"),
    input.manifest,
  );
  assert.deepEqual(result.sourceHashes, input.sourceHashes);
  assert.equal(
    await readFile(join(result.sitePath, "src/contact.md"), "utf8"),
    "Authored Contact edit.\n",
  );
  assert.equal(
    await readFile(join(input.outputPath, "source/package.json"), "utf8"),
    input.manifest,
  );
  const prepared = JSON.parse(
    await readFile(join(result.sitePath, "package.json"), "utf8"),
  );
  assert.deepEqual(prepared.dependencies, {
    "@wpmoo/astro": "file:../wpmoo-astro-0.1.0.tgz",
    astro: "7.3.3",
  });
  assert.equal(result.sdk.files["src/[...slug].astro"], hash("<slot />\n"));
  assert.equal(
    hash(await readFile(result.archivePath)),
    hash(await readFile(input.sdkArchive)),
  );
});

test("preparation_accepts_paths_with_spaces", async (t) => {
  const input = await fixture(t, "source with spaces");
  const result = await prepare(input);
  assert.equal(result.sitePath, join(input.outputPath, "site"));
  assert.deepEqual(result.sourceHashes, input.sourceHashes);
});

test("preparation_rejects_nonempty_output_before_writing", async (t) => {
  const input = await fixture(t);
  await mkdir(input.outputPath);
  await writeFile(join(input.outputPath, "owned.txt"), "Existing owner\n");
  await assert.rejects(prepare(input), /output must be empty/);
  assert.equal(
    await readFile(join(input.outputPath, "owned.txt"), "utf8"),
    "Existing owner\n",
  );
  assert.equal(
    await readFile(join(input.starterPath, "package.json"), "utf8"),
    input.manifest,
  );
});

test("preparation_rejects_overlapping_output_before_writing", async (t) => {
  const input = await fixture(t);
  await assert.rejects(
    prepare({ ...input, outputPath: join(input.starterPath, "prepared") }),
    /disjoint/,
  );
  assert.equal(
    await readFile(join(input.starterPath, "package.json"), "utf8"),
    input.manifest,
  );
});

test("preparation_rejects_authored_symlinks_before_writing", async (t) => {
  const input = await fixture(t);
  await symlink(
    join(input.starterPath, "src/contact.md"),
    join(input.starterPath, "src/linked.md"),
  );
  await assert.rejects(prepare(input), /source symlink/);
  await assert.rejects(readFile(join(input.outputPath, "site/package.json")), {
    code: "ENOENT",
  });
});

test("preparation_rejects_an_unselected_sdk_version", async (t) => {
  const input = await fixture(t, "source", "0.2.0");
  await assert.rejects(prepare(input), /SDK version/);
  await assert.rejects(readFile(join(input.outputPath, "site/package.json")), {
    code: "ENOENT",
  });
});

test("preparation_reuses_locked_transitives_without_changing_source", async (t) => {
  const input = await fixture(t);
  const lockPath = join(input.root, "retained-lock.json");
  const integrity = `sha512-${createHash("sha512")
    .update(await readFile(input.sdkArchive))
    .digest("base64")}`;
  const host = {
    version: "7.3.3",
    resolved: "https://registry.npmjs.org/astro/-/astro-7.3.3.tgz",
    integrity: "retained-host-integrity",
  };
  const seed = {
    name: "old-site",
    version: "0.1.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "old-site",
        dependencies: { "@wpmoo/astro": "0.1.0", astro: "7.3.3" },
      },
      "node_modules/@wpmoo/astro": {
        version: "0.1.0",
        integrity,
        resolved: "file:../old.tgz",
      },
      "node_modules/astro": host,
    },
  };
  await writeFile(lockPath, JSON.stringify(seed));
  const result = await prepare({ ...input, lockPath });
  const locked = JSON.parse(
    await readFile(join(result.sitePath, "package-lock.json"), "utf8"),
  );
  assert.deepEqual(locked.packages["node_modules/astro"], host);
  assert.equal(
    locked.packages["node_modules/@wpmoo/astro"].integrity,
    integrity,
  );
  assert.equal(
    locked.packages["node_modules/@wpmoo/astro"].resolved,
    "file:../wpmoo-astro-0.1.0.tgz",
  );
  assert.equal(locked.packages[""].name, "astro-moo-starter");
  assert.equal(
    await readFile(join(input.starterPath, "package.json"), "utf8"),
    input.manifest,
  );
});

test("direct_starter_rejects_extra_artifacts_or_links", async () => {
  const { validateStarterLock } =
    await import("../scripts/astro_starter_contracts.mjs");
  const lock = JSON.parse(
    await readFile(
      new URL("./fixtures/astro-starter/package-lock.json", import.meta.url),
      "utf8",
    ),
  );
  const manifest = {
    ...lock.packages[""],
    dependencies: {
      ...lock.packages[""].dependencies,
      "@wpmoo/astro": "file:../wpmoo-astro-0.1.0.tgz",
    },
  };
  lock.packages[""].dependencies = { ...manifest.dependencies };
  const sdk = {
    filename: "wpmoo-astro-0.1.0.tgz",
    manifest: { version: "0.1.0" },
    integrity:
      "sha512-Qfin4cuGooa87UrghOpqnm/TSDYBwQ7eZwz9q6HukxMCgioI9DbxtnA/qo126uZowHZf4ordBX9sc9i35fKP8Q==",
  };
  const artifacts = { "@wpmoo/astro": sdk };
  validateStarterLock(manifest, lock, artifacts);
  assert.throws(
    () =>
      validateStarterLock(manifest, lock, {
        ...artifacts,
        "@wpmoo/astro-theme-starter": sdk,
      }),
    /one SDK artifact/,
  );
  for (const mutation of [
    (d) => {
      d.packages["node_modules/@wpmoo/astro"].link = true;
    },
    (d) => {
      d.packages["node_modules/@wpmoo/astro"].integrity = "wrong";
    },
    (d) => {
      d.packages["node_modules/@wpmoo/astro-theme-starter"] = {
        version: "0.1.0",
      };
    },
  ]) {
    const changed = structuredClone(lock);
    mutation(changed);
    assert.throws(() => validateStarterLock(manifest, changed, artifacts));
  }
});

test("direct_starter_rejects_overlapping_proof_paths", async (t) => {
  const { assertStarterLocations } =
    await import("../scripts/verify_astro_starter.mjs");
  const input = await fixture(t);
  const cache = join(input.root, "cache");
  await mkdir(cache);
  const valid = {
    starterPath: input.starterPath,
    cache,
    output: input.outputPath,
  };
  assert.deepEqual(await assertStarterLocations(valid), {
    starterPath: input.starterPath,
    cachePath: cache,
    outputPath: input.outputPath,
  });
  await assert.rejects(
    assertStarterLocations({
      ...valid,
      output: join(input.starterPath, "proof"),
    }),
    /outside checkout/,
  );
  await assert.rejects(
    assertStarterLocations({ ...valid, output: join(cache, "proof") }),
    /disjoint/,
  );
  await mkdir(input.outputPath);
  await writeFile(join(input.outputPath, "owner"), "keep");
  await assert.rejects(assertStarterLocations(valid), /empty/);
  assert.equal(await readFile(join(input.outputPath, "owner"), "utf8"), "keep");
});

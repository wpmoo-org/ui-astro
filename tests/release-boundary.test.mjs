import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import * as boundaryModule from "../scripts/verify_astro_boundary.mjs";
import { buildSnapshot } from "../scripts/sync_layout_contract.mjs";

const { assertAstroSurface } = boundaryModule;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(root, "scripts/verify_astro_boundary.mjs");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const record = JSON.parse(await readFile(join(root, "contracts/astro-public-surface.json"), "utf8"));

function boundary(args = ["--mode", "release"]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: "/private/tmp/moo-astro-npm-cache" },
  });
}

test("published RC9 bytes and the current adapter archive satisfy the release boundary", () => {
  const result = boundary();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Astro release boundary: OK/);
});

test("the adapter rejects an added or missing public export", async () => {
  for (const changed of [
    { ...manifest, exports: { ...manifest.exports, "./extra.astro": "./src/components/Badge.astro" } },
    { ...manifest, exports: Object.fromEntries(Object.entries(manifest.exports).filter(([key]) => key !== "./components/Badge.astro")) },
  ]) {
    await assert.rejects(
      () => assertAstroSurface({ root, manifest: changed, record, files: record.files }),
      /public export map/,
    );
  }
});

test("a private transitive component cannot become a public export", async () => {
  const changed = {
    ...manifest,
    exports: { ...manifest.exports, "./components/internal/Icon.astro": "./src/components/internal/Icon.astro" },
  };
  await assert.rejects(
    () => assertAstroSurface({ root, manifest: changed, record, files: record.files }),
    /private transitive.*public export/,
  );
});

test("a public target must exist in the packed archive", async () => {
  const files = record.files.filter((path) => path !== "src/components/Badge.astro");
  await assert.rejects(
    () => assertAstroSurface({ root, manifest, record, files }),
    /Badge\.astro.*public target.*archive/,
  );
});

test("the archive rejects an unrecorded file", async () => {
  await assert.rejects(
    () => assertAstroSurface({ root, manifest, record, files: [...record.files, "src/unregistered.astro"] }),
    /archive file list/,
  );
});

test("packed source imports must resolve to packed files", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "moo-astro-import-"));
  try {
    await mkdir(join(fixture, "src"));
    await writeFile(join(fixture, "src/Test.astro"), '---\nimport Missing from "./Missing.astro";\n---\n<Missing />\n');
    await assert.rejects(
      () => boundaryModule.assertSourceClosure({ root: fixture, files: ["src/Test.astro"] }),
      /Test\.astro.*source import.*Missing\.astro.*packed/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("development snapshot rejects a moved HTML dev commit until reviewed sync", async () => {
  const stored = JSON.parse(await readFile(join(root, "contracts/layout-surface.snapshot.json"), "utf8"));
  const current = await buildSnapshot(join(root, "../html"));
  current.source.commit = "0".repeat(40);
  assert.throws(
    () => boundaryModule.assertDevelopmentSnapshot({ stored, current }),
    /development layout snapshot.*source commit/,
  );
});

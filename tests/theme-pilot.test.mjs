import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  defineSite,
  resolvePageOptions,
} from "../packages/astro/src/config/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const theme = new URL("../packages/theme-pilot/", import.meta.url);
const json = async (url) => JSON.parse(await readFile(url, "utf8"));

// Catches a theme seed that merges utilities or bypasses SDK diagnostics.
test("theme_defaults_replace_without_merging_arrays", async () => {
  const { defaultPreferences } = await import(
    new URL("src/preferences.js", theme)
  );
  const site = defineSite({ defaults: defaultPreferences });
  for (const [utilities, want] of [
    [undefined, ["py-3"]],
    [["py-2"], ["py-2"]],
    [[], []],
  ]) {
    const resolved = resolvePageOptions(site, "page", "single", {
      parts: { content: { utilities } },
    });
    assert.deepEqual(resolved.parts.content.utilities, want);
    assert.ok(resolved.sidebar);
    assert.ok(Object.isFrozen(resolved.parts.content.utilities));
  }
  assert.throws(
    () =>
      resolvePageOptions(site, "page", "single", {
        parts: { pageHeader: { titleUtilities: ["fw-normal"] } },
      }),
    /titleUtilities/,
  );
  assert.throws(
    () =>
      resolvePageOptions(site, "page", "single", {
        parts: {
          pageHeader: { descriptionUtilities: ["text-primary", "mb-3"] },
        },
      }),
    /descriptionUtilities/,
  );
});

test("theme_manifest_has_exact_peers", async () => {
  const manifest = await json(new URL("package.json", theme));
  assert.equal(manifest.name, "@wpmoo/astro-theme-pilot");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.peerDependencies, {
    "@wpmoo/astro": "0.1.0",
    astro: "7.3.3",
  });
  assert.equal(manifest.dependencies, undefined);
  const workspace = await json(new URL("../package.json", import.meta.url));
  assert.deepEqual(workspace.workspaces, ["packages/*", "apps/demo"]);
});

// Runs npm's real pack inventory, catching app/SDK/tooling leakage and absent exports.
test("theme_pack_has_only_owned_source", async () => {
  const manifest = await json(new URL("package.json", theme));
  const packed = spawnSync(
    "npm",
    [
      "pack",
      "--workspace",
      manifest.name,
      "--dry-run",
      "--json",
      "--cache",
      "/private/tmp/astro-options-20261002/full-cache",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(packed.status, 0, packed.stderr);
  const files = JSON.parse(packed.stdout)[0]
    .files.map((file) => file.path)
    .sort();
  const source = [
    "src/Layout.astro",
    "src/preferences.js",
    "src/preferences.d.ts",
    "src/types.js",
    "src/types.d.ts",
    "src/views/Page.astro",
    "src/views/Post.astro",
    "src/views/Archive.astro",
    "src/views/NotFound.astro",
    "src/sections/Action.astro",
  ];
  assert.deepEqual(
    files,
    [
      ...source,
      "package.json",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "README.md",
    ].sort(),
  );
  assert.deepEqual(
    Object.keys(manifest.exports).sort(),
    [
      "./preferences",
      "./types",
      "./Layout.astro",
      "./views/Page.astro",
      "./views/Post.astro",
      "./views/Archive.astro",
      "./views/NotFound.astro",
      "./sections/Action.astro",
      "./package.json",
    ].sort(),
  );
  for (const target of Object.values(manifest.exports)) {
    for (const path of typeof target === "string"
      ? [target]
      : Object.values(target)) {
      assert.ok(
        files.includes(path.replace(/^\.\//, "")),
        `unpacked export: ${path}`,
      );
    }
  }
});

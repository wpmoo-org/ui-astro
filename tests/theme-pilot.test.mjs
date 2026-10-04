import assert from "node:assert/strict";
import {
  readFile,
  readdir,
  mkdtemp,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
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
const siteRoot = new URL("../apps/theme-pilot/", import.meta.url);

function projectProfile(main, category) {
  const script = `const c = await import(${JSON.stringify(new URL("src/config.js", siteRoot).href)}); const d = await import(${JSON.stringify(new URL("src/definitions.js", siteRoot).href)}); const a = (await import(${JSON.stringify(new URL("astro.config.mjs", siteRoot).href)})).default; process.stdout.write(JSON.stringify({main:c.mainLanguage, src:c.srcDir.href, category:c.categoryPrefixes, site:d.site.defaults, i18n:a.i18n, bases:d.taxonomies.map(t=>[t.id,t.archive.basePath,t.locales.de.basePath])}));`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      env: {
        ...process.env,
        PILOT_MAIN_LANGUAGE: main,
        PILOT_CATEGORY_PROFILE: category,
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("main_language_is_one_project_input", () => {
  for (const main of ["en", "de"]) {
    for (const [profile, prefixes] of [
      ["category", { en: "/category", de: "/kategorie" }],
      ["short", { en: "/c", de: "/k" }],
      ["root", { en: "/", de: "/" }],
    ]) {
      const actual = projectProfile(main, profile);
      assert.equal(actual.main, main);
      assert.equal(actual.site.lang, main);
      assert.equal(actual.i18n.defaultLocale, main);
      assert.equal(actual.i18n.routing.prefixDefaultLocale, false);
      assert.deepEqual(actual.category, prefixes);
      assert.deepEqual(actual.bases, [
        ["category", prefixes.en, prefixes.de],
        ["tag", "/tag", "/schlagwort"],
        ["sector", "/", "/"],
      ]);
      assert.ok(actual.src.endsWith(`/routes/${main}/`));
    }
  }
});

test("project_preferences_replace_theme_seed", () => {
  const actual = projectProfile("en", "category");
  assert.deepEqual(actual.site.parts.content.utilities, ["py-2"]);
  assert.ok(actual.site.sidebar);
});

test("selected_native_tree_has_only_required_literal_routes", async () => {
  for (const [main, wanted] of [
    [
      "en",
      [
        "404.astro",
        "blog/index.astro",
        "native-action.astro",
        "de/404.astro",
        "de/beitraege/index.astro",
        "de/native-action.astro",
      ],
    ],
    [
      "de",
      [
        "404.astro",
        "beitraege/index.astro",
        "native-action.astro",
        "en/404.astro",
        "en/blog/index.astro",
        "en/native-action.astro",
      ],
    ],
  ]) {
    const dir = new URL(`routes/${main}/pages/`, siteRoot);
    const files = await readdir(dir, { recursive: true });
    assert.deepEqual(
      files
        .filter((path) => path.endsWith(".astro") && !path.includes("["))
        .sort(),
      wanted.sort(),
    );
  }
});

// Catches a theme seed that merges utilities or bypasses SDK diagnostics.
test("theme_defaults_replace_without_merging_arrays", async () => {
  const { defaultPreferences } = await import(
    new URL("src/preferences.js", theme)
  );
  const site = defineSite({ defaults: defaultPreferences });
  for (const [utilities, want] of [
    [undefined, ["py-4"]],
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
  assert.equal(manifest.version, "0.1.1");
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

test("sealed_pilot_rejects_workspace_resolution", async () => {
  const { validatePilotLock } =
    await import("../scripts/theme_pilot_contracts.mjs");
  const manifest = await json(new URL("package.json", siteRoot));
  const lock = await json(new URL("package-lock.json", siteRoot));
  const artifacts = Object.fromEntries(
    ["@wpmoo/astro", "@wpmoo/astro-theme-pilot"].map((name) => [
      name,
      {
        filename: manifest.dependencies[name].split("/").at(-1),
        integrity: lock.packages[`node_modules/${name}`].integrity,
        manifest: { version: "0.1.0" },
      },
    ]),
  );
  for (const [name, artifact] of Object.entries(artifacts)) {
    manifest.dependencies[name] = `file:../${artifact.filename}`;
    lock.packages[""].dependencies[name] = manifest.dependencies[name];
    lock.packages[`node_modules/${name}`].resolved =
      manifest.dependencies[name];
  }
  validatePilotLock(manifest, lock, artifacts);
  lock.packages["node_modules/@wpmoo/astro"].link = true;
  assert.throws(
    () => validatePilotLock(manifest, lock, artifacts),
    /link|workspace/,
  );
});

test("sealed_pilot_rejects_changed_archives", async () => {
  const { assertPilotArchives } =
    await import("../scripts/theme_pilot_contracts.mjs");
  const directory = await mkdtemp(join(tmpdir(), "theme-pilot-archive-"));
  try {
    await writeFile(join(directory, "owned.tgz"), "original");
    const artifacts = {
      theme: {
        filename: "owned.tgz",
        sha256: createHash("sha256").update("original").digest("hex"),
        integrity: `sha512-${createHash("sha512").update("original").digest("base64")}`,
      },
    };
    await assertPilotArchives(directory, artifacts);
    await writeFile(join(directory, "owned.tgz"), "substitution");
    await assert.rejects(
      assertPilotArchives(directory, artifacts),
      /archive changed/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("sealed_archive_accepts_native_rest_route_filenames", async () => {
  const { archiveRecord } = await import("../scripts/verify_theme_pilot.mjs");
  const record = await archiveRecord(
    join(root, "artifacts/theme-pilot/wpmoo-astro-0.1.0.tgz"),
  );
  assert.ok(record.files["src/integration/routes/[...probe].astro"]);
  assert.equal(
    record.sha256,
    "03b3a082a90681a1ebf8c3d3a5ae03dee0bae8146a3430e07b21a3ead61b8141",
  );
});

test("theme_patch_archive_changes_only_version_and_fallback", async () => {
  const { archiveRecord } = await import("../scripts/verify_theme_pilot.mjs");
  const original = await archiveRecord(
    join(root, "artifacts/theme-pilot/wpmoo-astro-theme-pilot-0.1.0.tgz"),
  );
  const updated = await archiveRecord(
    join(root, "artifacts/theme-pilot/wpmoo-astro-theme-pilot-0.1.1.tgz"),
  );
  assert.notEqual(original.filename, updated.filename);
  assert.notEqual(original.integrity, updated.integrity);
  assert.equal(updated.manifest.version, "0.1.1");
  assert.deepEqual(
    Object.keys(updated.files).sort(),
    Object.keys(original.files).sort(),
  );
  assert.deepEqual(
    Object.keys(updated.files)
      .filter((name) => updated.files[name] !== original.files[name])
      .sort(),
    ["package.json", "src/preferences.js"],
  );
});

test("sealed_pilot_rejects_symlinked_source_and_nonempty_output", async () => {
  const { assertPilotLocations, assertPlainInputTree } =
    await import("../scripts/verify_theme_pilot.mjs");
  const directory = await mkdtemp("/private/tmp/theme-pilot-input-");
  try {
    await writeFile(join(directory, "source"), "owned");
    await symlink(join(directory, "source"), join(directory, "alias"));
    await assert.rejects(assertPlainInputTree(directory), /symlink/);
    await assert.rejects(
      assertPilotLocations({
        cache: "/private/tmp/astro-options-20261002/full-cache",
        output: directory,
      }),
      /empty/,
    );
    await assert.rejects(
      assertPilotLocations({
        cache: "/private/tmp/astro-options-20261002/full-cache",
        output: root,
      }),
      /workspace/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

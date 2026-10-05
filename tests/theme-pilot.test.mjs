import assert from "node:assert/strict";
import {
  readFile,
  readdir,
  mkdtemp,
  writeFile,
  symlink,
  rm,
  mkdir,
  copyFile,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  defineSite,
  resolvePageOptions,
} from "../packages/astro/src/config/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const theme = new URL("../packages/theme-starter/", import.meta.url);
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

test("taxonomy_groups_keep_localized_custom_terms_and_entry_membership", async () => {
  const { groupTaxonomyLinks, entryTaxonomyGroups } =
    await import("../apps/theme-pilot/src/taxonomy-links.js");
  const taxonomies = [
    {
      id: "category",
      label: "Categories",
      locales: { de: { label: "Kategorien" } },
    },
    {
      id: "audience",
      label: "Audiences",
      locales: { de: { label: "Zielgruppen" } },
    },
  ];
  const paths = [
    {
      props: {
        taxonomy: "category",
        term: { id: "guides", name: "Anleitungen" },
        href: "/de/anleitungen",
      },
    },
    {
      props: {
        taxonomy: "audience",
        term: { id: "teachers", name: "Lehrkräfte" },
        href: "/de/fuer-lehrkraefte",
      },
    },
    {
      props: {
        taxonomy: "audience",
        term: { id: "students", name: "Lernende" },
        href: "/de/lernende",
      },
    },
  ];
  const groups = groupTaxonomyLinks(taxonomies, paths, "de");
  assert.deepEqual(groups, [
    {
      id: "category",
      label: "Kategorien",
      links: [{ id: "guides", label: "Anleitungen", href: "/de/anleitungen" }],
    },
    {
      id: "audience",
      label: "Zielgruppen",
      links: [
        { id: "teachers", label: "Lehrkräfte", href: "/de/fuer-lehrkraefte" },
        { id: "students", label: "Lernende", href: "/de/lernende" },
      ],
    },
  ]);
  const entry = { taxonomies: { audience: ["students", "teachers"] } };
  assert.deepEqual(entryTaxonomyGroups(entry, groups), [groups[1]]);
  assert.deepEqual(entryTaxonomyGroups({ taxonomies: {} }, groups), []);
  assert.deepEqual(entryTaxonomyGroups({}, groups), []);
  assert.deepEqual(groupTaxonomyLinks(taxonomies, [], "en"), []);
  assert.equal(
    groupTaxonomyLinks(taxonomies, paths, "en")[1].label,
    "Audiences",
  );
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
  assert.equal(manifest.name, "@wpmoo/astro-theme-starter");
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
  assert.equal(manifest.name, "@wpmoo/astro-theme-starter");
  const cache = await realpath(
    await mkdtemp(join(tmpdir(), "pilot-pack-cache-")),
  );
  const packed = spawnSync(
    "npm",
    [
      "pack",
      "--workspace",
      manifest.name,
      "--dry-run",
      "--json",
      "--offline",
      "--cache",
      cache,
    ],
    { cwd: root, encoding: "utf8" },
  );
  await rm(cache, { recursive: true });
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
    [...source, "package.json", "LICENSE", "README.md"].sort(),
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
    ["@wpmoo/astro", "@wpmoo/astro-theme-starter"].map((name) => [
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
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "pilot-archive-")),
  );
  try {
    const source = join(directory, "source");
    await mkdir(join(source, "src/integration/routes"), { recursive: true });
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name: "pilot-archive-fixture",
        version: "0.0.0",
        private: true,
        files: ["src"],
      }),
    );
    const filename = "src/integration/routes/[...probe].astro";
    const body = "---\nexport const prerender = true;\n---\n";
    await writeFile(join(source, filename), body);
    const packed = spawnSync(
      "npm",
      [
        "pack",
        "--json",
        "--offline",
        "--ignore-scripts",
        "--pack-destination",
        directory,
        "--cache",
        join(directory, "cache"),
      ],
      { cwd: source, encoding: "utf8" },
    );
    assert.equal(packed.status, 0, packed.stderr);
    const record = await archiveRecord(
      join(directory, JSON.parse(packed.stdout)[0].filename),
    );
    assert.equal(
      record.files[filename],
      createHash("sha256").update(body).digest("hex"),
    );
    assert.deepEqual(Object.keys(record.files).sort(), [
      "package.json",
      filename,
    ]);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("sealed_pilot_rejects_symlinked_source_and_nonempty_output", async () => {
  const { assertPilotLocations, assertPlainInputTree } =
    await import("../scripts/verify_theme_pilot.mjs");
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "theme-pilot-input-")),
  );
  try {
    const cache = join(directory, "cache");
    const output = join(directory, "output");
    await mkdir(cache);
    await mkdir(output);
    await writeFile(join(output, "retained"), "owned");
    await writeFile(join(directory, "source"), "owned");
    await symlink(join(directory, "source"), join(directory, "alias"));
    await assert.rejects(assertPlainInputTree(directory), /symlink/);
    await assert.rejects(
      assertPilotLocations({
        cache,
        output,
      }),
      /empty/,
    );
    await assert.rejects(
      assertPilotLocations({
        cache,
        output: root,
      }),
      /checkout/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

async function copyController(directory) {
  const checkout = join(directory, "checkout with spaces");
  await mkdir(join(checkout, "scripts"), { recursive: true });
  for (const name of [
    "verify_theme_pilot.mjs",
    "packed_consumer_contracts.mjs",
    "theme_pilot_contracts.mjs",
  ]) {
    await copyFile(
      join(root, "scripts", name),
      join(checkout, "scripts", name),
    );
  }
  return join(checkout, "scripts/verify_theme_pilot.mjs");
}

test("sealed_pilot_locations_work_in_an_independent_checkout", async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "pilot-checkout-")),
  );
  try {
    const controller = await copyController(directory);
    const { assertPilotLocations } = await import(pathToFileURL(controller));
    const cache = join(directory, "cache");
    const output = join(directory, "proof");
    await mkdir(cache);
    assert.deepEqual(await assertPilotLocations({ cache, output }), {
      cachePath: cache,
      outputPath: output,
    });
    await assert.rejects(
      assertPilotLocations({
        cache,
        output: join(directory, "checkout with spaces/proof"),
      }),
      /outside/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("sealed_pilot_cli_runs_when_its_checkout_path_contains_spaces", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "pilot-cli-")));
  try {
    const controller = await copyController(directory);
    const result = spawnSync(process.execPath, [controller, "--unexpected"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1, "the CLI must reject invalid arguments");
    assert.match(result.stderr, /unknown argument/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

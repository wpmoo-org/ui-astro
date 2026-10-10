import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import * as boundaryModule from "../scripts/verify_astro_boundary.mjs";

const { assertAstroSurface } = boundaryModule;

import { REPO_ROOT, SDK_ROOT } from "../scripts/project-paths.mjs";

const root = SDK_ROOT;
const script = join(REPO_ROOT, "scripts/verify_astro_boundary.mjs");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const record = JSON.parse(
  await readFile(join(root, "contracts/astro-public-surface.json"), "utf8"),
);

function boundary(args = ["--mode", "release"]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: join(tmpdir(), "moo-astro-npm-cache"),
    },
  });
}

test("published Core intake passes the stable release boundary", () => {
  const result = boundary();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Astro release boundary: OK/);
});

test("published Core release validation does not depend on a cache override", () => {
  const env = { ...process.env };
  delete env.npm_config_cache;
  delete env.NPM_CONFIG_CACHE;
  const result = spawnSync(process.execPath, [script, "--mode", "release"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Astro release boundary: OK/);
});

test("the npm archive excludes aggregate notices and retains copied icon attribution", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "moo-astro-license-pack-"));
  try {
    const packed = spawnSync(
      "npm",
      [
        "pack",
        "--workspace",
        manifest.name,
        "--offline",
        "--json",
        "--pack-destination",
        fixture,
        "--cache",
        join(fixture, "cache"),
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    assert.equal(packed.status, 0, packed.stderr);
    const archive = JSON.parse(packed.stdout)[0];
    const files = archive.files.map((file) => file.path);
    assert.equal(files.includes("THIRD_PARTY_NOTICES.md"), false);
    const contents = (path) => {
      const extracted = spawnSync(
        "tar",
        ["-xOf", join(fixture, archive.filename), `package/${path}`],
        { encoding: "utf8" },
      );
      assert.equal(extracted.status, 0, extracted.stderr);
      return extracted.stdout;
    };
    assert.equal(JSON.parse(contents("package.json")).license, "MIT");
    assert.match(contents("LICENSE"), /MIT License/);
    assert.doesNotMatch(contents("README.md"), /\]\(THIRD_PARTY_NOTICES\.md\)/);
    const icon = contents("src/components/internal/Icon.astro");
    assert.match(icon, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
    assert.match(
      icon,
      /copyright notice and this permission notice appear in all copies/,
    );
    assert.match(icon, /Copyright \(c\) 2013-present Cole Bemis/);
    assert.match(icon, /all copies or substantial portions of the Software/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("the adapter rejects an added or missing public export", async () => {
  for (const changed of [
    {
      ...manifest,
      exports: {
        ...manifest.exports,
        "./extra.astro": "./src/components/Badge.astro",
      },
    },
    {
      ...manifest,
      exports: Object.fromEntries(
        Object.entries(manifest.exports).filter(
          ([key]) => key !== "./components/Badge.astro",
        ),
      ),
    },
  ]) {
    await assert.rejects(
      () =>
        assertAstroSurface({
          root,
          manifest: changed,
          record,
          files: record.files,
        }),
      /public export map/,
    );
  }
});

test("the accepted CSS and runtime facades are exact public entrypoints", async () => {
  const facades = {
    "./styles.css": "./src/styles.css",
    "./runtime/moo-ui.js": "./src/runtime/moo-ui.js",
    "./runtime/bootstrap.js": "./src/runtime/bootstrap.js",
  };
  for (const [specifier, target] of Object.entries(facades)) {
    assert.equal(manifest.exports[specifier], target);
    const changed = {
      ...manifest,
      exports: {
        ...manifest.exports,
        [specifier]: "./src/components/Badge.astro",
      },
    };
    await assert.rejects(
      () =>
        assertAstroSurface({
          root,
          manifest: changed,
          record,
          files: record.files,
        }),
      /public export map/,
    );
  }
  for (const privatePath of [
    "apps/demo/pages/index.astro",
    "apps/demo/content.config.ts",
    "apps/demo/content/page/en/contact.md",
    "src/styles/layout.css",
    "contracts/layout-surface.snapshot.json",
  ]) {
    assert.equal(
      record.files.includes(privatePath),
      false,
      `${privatePath} must stay outside the published archive`,
    );
  }
});

test("a private transitive component cannot become a public export", async () => {
  const changed = {
    ...manifest,
    exports: {
      ...manifest.exports,
      "./components/internal/Icon.astro":
        "./src/components/internal/Icon.astro",
    },
  };
  await assert.rejects(
    () =>
      assertAstroSurface({
        root,
        manifest: changed,
        record,
        files: record.files,
      }),
    /private transitive.*public export/,
  );
});

test("a public target must exist in the packed archive", async () => {
  const files = record.files.filter(
    (path) => path !== "src/components/Badge.astro",
  );
  await assert.rejects(
    () => assertAstroSurface({ root, manifest, record, files }),
    /Badge\.astro.*public target.*archive/,
  );
});

test("the Moo ESM facade must be present in the packed archive", async () => {
  const files = record.files.filter((path) => path !== "src/runtime/moo-ui.js");
  await assert.rejects(
    () => assertAstroSurface({ root, manifest, record, files }),
    /runtime\/moo-ui\.js.*public target.*archive/,
  );
});

test("the archive rejects an unrecorded file", async () => {
  await assert.rejects(
    () =>
      assertAstroSurface({
        root,
        manifest,
        record,
        files: [...record.files, "src/unregistered.astro"],
      }),
    /archive file list/,
  );
});

test("packed source imports must resolve to packed files", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "moo-astro-import-"));
  try {
    await mkdir(join(fixture, "src"));
    await writeFile(
      join(fixture, "src/Test.astro"),
      '---\nimport Missing from "./Missing.astro";\n---\n<Missing />\n',
    );
    await assert.rejects(
      () =>
        boundaryModule.assertSourceClosure({
          root: fixture,
          files: ["src/Test.astro"],
        }),
      /Test\.astro.*source import.*Missing\.astro.*packed/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Vite raw import resolves the published classic state script export", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "moo-astro-state-import-"));
  try {
    await mkdir(join(fixture, "src"));
    await writeFile(
      join(fixture, "src/Test.astro"),
      '---\nimport state from "@wpmoo/ui/state.js?raw";\n---\n<script is:inline set:html={state} />\n',
    );
    await boundaryModule.assertSourceClosure({
      root: fixture,
      files: ["src/Test.astro"],
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("development source closure can use an explicit local dev export registry", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "moo-astro-dev-import-"));
  try {
    await mkdir(join(fixture, "src"));
    await writeFile(
      join(fixture, "src/Test.astro"),
      '---\nimport "@wpmoo/ui/dev-only.js";\n---\n<main>Dev</main>\n',
    );
    await boundaryModule.assertSourceClosure({
      root: fixture,
      files: ["src/Test.astro"],
      coreExports: { "./dev-only.js": "./dist/js/dev-only.js" },
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("development snapshot rejects a moved HTML dev commit until reviewed sync", async () => {
  const stored = JSON.parse(
    await readFile(
      join(root, "contracts/layout-surface.snapshot.json"),
      "utf8",
    ),
  );
  const current = structuredClone(stored);
  current.source.commit = "0".repeat(40);
  assert.throws(
    () => boundaryModule.assertDevelopmentSnapshot({ stored, current }),
    /development layout snapshot.*source commit/,
  );
});

test("packing the private repository root cannot certify it as the SDK", async () => {
  await assert.rejects(
    () => assertAstroSurface({ root: REPO_ROOT, record, files: record.files }),
    /package identity/,
  );
});

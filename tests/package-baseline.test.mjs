import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertCoreArtifact,
  assertPackageCompatibility,
  assertReleasePin,
  developmentInstallCommand,
  installDevelopmentPackage,
  checkRelease,
} from "../scripts/sync_package_baseline.mjs";
import {
  REPO_ROOT,
  SDK_ROOT,
  CONSUMER_ROOT,
  corePackageRoot,
} from "../scripts/project-paths.mjs";

test("workspace uses the exact published Core 1.1.0 baseline", async () => {
  const packageJson = JSON.parse(
    await readFile(join(SDK_ROOT, "package.json"), "utf8"),
  );
  const packageLock = JSON.parse(
    await readFile(join(REPO_ROOT, "package-lock.json"), "utf8"),
  );
  const artifactRecord = JSON.parse(
    await readFile(
      join(SDK_ROOT, "contracts/ui-1.1.0-package.json"),
      "utf8",
    ),
  );
  assert.equal(artifactRecord.version, "1.1.0");
  assert.doesNotThrow(() => assertReleasePin({ packageJson, packageLock }));
  assert.throws(
    () =>
      assertReleasePin({
        packageJson: {
          ...packageJson,
          dependencies: {
            ...packageJson.dependencies,
            "@wpmoo/ui": "1.1.0-dev.1",
          },
        },
        packageLock,
      }),
    /declared.*must be 1.1.0/,
  );
  await assertCoreArtifact({ artifactRecord });
});

test("the MIT Astro package carries its license while publication remains separately gated", async () => {
  const declared = JSON.parse(
    await readFile(join(SDK_ROOT, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(join(REPO_ROOT, "package-lock.json"), "utf8"),
  );
  const consumerLock = JSON.parse(
    await readFile(join(CONSUMER_ROOT, "package-lock.json"), "utf8"),
  );
  const surface = JSON.parse(
    await readFile(
      join(SDK_ROOT, "contracts/astro-public-surface.json"),
      "utf8",
    ),
  );

  assert.equal(declared.private, true);
  assert.equal(declared.license, "MIT");
  assert.equal(lock.packages["packages/astro"].license, declared.license);
  assert.equal(
    consumerLock.packages[`node_modules/${declared.name}`].license,
    declared.license,
  );
  assert.equal(declared.files.includes("LICENSE"), true);
  assert.equal(surface.files.includes("LICENSE"), true);
});

test("package retains all existing public wrappers plus the shared TOC and the explicit integration, Page and Post surface", async () => {
  const declared = JSON.parse(
    await readFile(join(SDK_ROOT, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(join(REPO_ROOT, "package-lock.json"), "utf8"),
  );
  const surface = JSON.parse(
    await readFile(
      join(SDK_ROOT, "contracts/astro-public-surface.json"),
      "utf8",
    ),
  );
  assert.equal(declared.name, "@wpmoo/astro");
  assert.equal(
    declared.repository?.url,
    "https://github.com/wpmoo-org/ui-astro.git",
  );
  assert.equal(lock.name, "@wpmoo/astro-workspace");
  assert.equal(lock.packages["packages/astro"].name, declared.name);
  assert.equal(surface.package, declared.name);
  assert.equal(Object.keys(declared.exports).length, 91);
  assert.equal(
    declared.exports["./blocks/LanguageSwitcher.astro"],
    "./src/blocks/language-switcher/LanguageSwitcher.astro",
  );
  assert.equal(declared.exports["./not-found"], "./src/not-found/index.js");
  assert.equal(
    declared.exports["./views/NotFound.astro"],
    "./src/views/NotFound.astro",
  );
  assert.equal(
    Object.keys(declared.exports).filter((path) =>
      path.startsWith("./components/"),
    ).length,
    46,
  );
  assert.equal(declared.exports["./config"], "./src/config/index.js");
  assert.equal(declared.exports["./seo"], "./src/seo/index.js");
  assert.equal(declared.exports["./i18n"], "./src/i18n/index.js");
  assert.equal(declared.exports["./plugins"], "./src/plugins/index.js");
  assert.equal(declared.exports["./content"], "./src/content/index.js");
  assert.equal(
    declared.exports["./plugins/page"],
    "./src/plugins/page/index.js",
  );
  assert.equal(
    declared.exports["./plugins/page/content"],
    "./src/plugins/page/content.js",
  );
  assert.equal(
    declared.exports["./plugins/page/queries"],
    "./src/plugins/page/queries.js",
  );
  assert.equal(
    declared.exports["./plugins/post"],
    "./src/plugins/post/index.js",
  );
  assert.equal(
    declared.exports["./plugins/post/content"],
    "./src/plugins/post/content.js",
  );
  assert.equal(
    declared.exports["./plugins/post/queries"],
    "./src/plugins/post/queries.js",
  );
  for (const name of ["", "/content", "/queries"])
    assert.equal(
      declared.exports[`./taxonomies${name}`],
      `./src/taxonomies/${name ? name.slice(1) : "index"}.js`,
    );
  assert.equal(declared.exports["."], "./src/integration/index.js");
  assert.equal(declared.exports["./context"], "./src/context/index.js");
  for (const view of ["Single", "Archive", "Loop"]) {
    assert.equal(
      declared.exports[`./plugins/page/views/${view}.astro`],
      `./src/plugins/page/views/${view}.astro`,
    );
    assert.equal(
      declared.exports[`./plugins/post/views/${view}.astro`],
      `./src/plugins/post/views/${view}.astro`,
    );
  }
  assert.equal(
    Object.keys(declared.exports).filter((path) =>
      path.startsWith("./includes/"),
    ).length,
    4,
  );
  assert.equal(
    Object.keys(declared.exports).filter((path) => path.startsWith("./views/"))
      .length,
    4,
  );
  assert.deepEqual(declared.exports, surface.exports);
  assert.deepEqual(
    Object.keys(declared.exports).sort(),
    Object.keys(surface.exports).sort(),
  );
  assert.equal(declared.exports["./components/internal/Icon.astro"], undefined);
});

const packageJson = {
  dependencies: {
    "@wpmoo/ui": "1.1.0",
  },
};

const packageLock = {
  lockfileVersion: 3,
  packages: {
    "": { name: "@wpmoo/astro-workspace" },
    "packages/astro": packageJson,
    "node_modules/@wpmoo/ui": {
      version: "1.1.0",
      resolved: "https://registry.npmjs.org/@wpmoo/ui/-/ui-1.1.0.tgz",
      integrity:
        "sha512-bdGLIxzM53hI05rgqLcoLyfJINU1iweGq5tNq9PFl1VpNJYHbHEVGr0D/7rVEkzgMOJY1iaw2SRdc/JxqBgUgg==",
    },
  },
};

const fileLock = {
  ...packageLock,
  packages: {
    ...packageLock.packages,
    "node_modules/@wpmoo/ui": {
      ...packageLock.packages["node_modules/@wpmoo/ui"],
      resolved: "file:../html",
    },
  },
};

test("release pin reads the SDK workspace owner rather than the private root", () => {
  const lock = structuredClone(packageLock);
  lock.packages[""] = { name: "@wpmoo/astro-workspace" };
  lock.packages["packages/astro"] = packageJson;
  assert.doesNotThrow(() =>
    assertReleasePin({ packageJson, packageLock: lock }),
  );
});

test("a correct root declaration cannot hide an incorrect SDK workspace pin", () => {
  const lock = structuredClone(packageLock);
  lock.packages[""] = packageJson;
  lock.packages["packages/astro"] = {
    dependencies: { "@wpmoo/ui": "1.0.0-rc.9" },
  };
  assert.throws(
    () => assertReleasePin({ packageJson, packageLock: lock }),
    /workspace.*release pin/,
  );
});

async function writeProject(root, lock = packageLock) {
  await mkdir(join(root, "packages/astro"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "@wpmoo/astro-workspace",
      private: true,
      workspaces: ["packages/*", "apps/demo"],
    }),
  );
  await writeFile(
    join(root, "packages/astro/package.json"),
    `${JSON.stringify(packageJson)}\n`,
  );
  await writeFile(join(root, "package-lock.json"), `${JSON.stringify(lock)}\n`);
}

async function writeReleaseFixture(root) {
  await writeProject(root);
  await mkdir(join(root, "node_modules/@wpmoo"), { recursive: true });
  await cp(corePackageRoot(), join(root, "node_modules/@wpmoo/ui"), {
    recursive: true,
  });
}

test("development install never rewrites tracked dependency inputs", async () => {
  assert.deepEqual(developmentInstallCommand("/tmp/ui.tgz"), [
    "install",
    "--workspace",
    "@wpmoo/astro",
    "--no-save",
    "--ignore-scripts",
    "--force",
    "/tmp/ui.tgz",
  ]);

  const root = await mkdtemp(join(tmpdir(), "moo-astro-baseline-"));
  try {
    await writeProject(root);
    const beforePackage = await readFile(join(root, "package.json"), "utf8");
    const beforeLock = await readFile(join(root, "package-lock.json"), "utf8");
    const beforeSdk = await readFile(
      join(root, "packages/astro/package.json"),
      "utf8",
    );
    await mkdir(join(root, "node_modules/.vite"), { recursive: true });
    await writeFile(join(root, "node_modules/keep.txt"), "keep");
    const commands = [];

    await installDevelopmentPackage({
      tarball: "/tmp/ui.tgz",
      repoRoot: root,
      runner: async (command, options) => {
        commands.push({ command, options });
      },
    });

    assert.deepEqual(commands[0].command, [
      "npm",
      ...developmentInstallCommand("/tmp/ui.tgz"),
    ]);
    assert.equal(commands[0].options.cwd, root);
    assert.equal(
      await readFile(join(root, "package.json"), "utf8"),
      beforePackage,
    );
    assert.equal(
      await readFile(join(root, "package-lock.json"), "utf8"),
      beforeLock,
    );
    assert.equal(
      await readFile(join(root, "packages/astro/package.json"), "utf8"),
      beforeSdk,
    );
    await assert.rejects(() => readFile(join(root, "node_modules/.vite")));
    assert.equal(
      await readFile(join(root, "node_modules/keep.txt"), "utf8"),
      "keep",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release pin rejects a file dependency", () => {
  assert.throws(
    () => assertReleasePin({ packageJson, packageLock: fileLock }),
    /file dependency/,
  );
});

test("release pin accepts the exact registry package lock", () => {
  assert.doesNotThrow(() => assertReleasePin({ packageJson, packageLock }));
});

test("release pin rejects a registry URL or integrity drift", () => {
  const core = packageLock.packages["node_modules/@wpmoo/ui"];
  for (const [field, value, reason] of [
    ["resolved", "https://example.invalid/ui.tgz", /registry URL/],
    ["integrity", "sha512-test", /integrity/],
  ]) {
    const changed = structuredClone(packageLock);
    changed.packages["node_modules/@wpmoo/ui"] = { ...core, [field]: value };
    assert.throws(
      () => assertReleasePin({ packageJson, packageLock: changed }),
      reason,
    );
  }
});

test("package compatibility rejects a different package name or version", () => {
  assert.doesNotThrow(() =>
    assertPackageCompatibility({
      packageName: "@wpmoo/ui",
      packageVersion: "1.1.0",
      packageJson,
    }),
  );
  assert.throws(
    () =>
      assertPackageCompatibility({
        packageName: "@other/ui",
        packageVersion: "1.1.0",
        packageJson,
      }),
    /package name/,
  );
  assert.throws(
    () =>
      assertPackageCompatibility({
        packageName: "@wpmoo/ui",
        packageVersion: "1.0.0-rc.8",
        packageJson,
      }),
    /package version/,
  );
});

test("release checking rejects development bytes without running npm or a layout writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "moo-astro-release-"));
  try {
    await writeReleaseFixture(root);
    const manifestPath = join(root, "node_modules/@wpmoo/ui/package.json");
    const installed = JSON.parse(await readFile(manifestPath, "utf8"));
    installed.version = "1.1.0-dev.1";
    await writeFile(manifestPath, `${JSON.stringify(installed)}\n`);
    let invoked = false;
    await assert.rejects(
      () =>
        checkRelease({
          repoRoot: root,
          runner: async () => {
            invoked = true;
            throw new Error("npm/layout writer must not run");
          },
        }),
      /identity differs/,
    );
    assert.equal(invoked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release checking rejects changed manifest and browser artifacts after lock resolution", async () => {
  for (const [target, reason] of [
    ["dist/release-manifest.json", /release-manifest\.json.*artifact hash/],
    ["dist/js/sidebar.js", /sidebar\.js.*artifact hash/],
  ]) {
    const root = await mkdtemp(join(tmpdir(), "moo-astro-artifact-"));
    try {
      await writeReleaseFixture(root);
      const path = join(root, "node_modules/@wpmoo/ui", target);
      await writeFile(path, `${await readFile(path, "utf8")}\n `);
      const artifactRecord = JSON.parse(
        await readFile(
          join(SDK_ROOT, "contracts/ui-1.1.0-package.json"),
          "utf8",
        ),
      );
      await assert.rejects(
        () => assertCoreArtifact({ repoRoot: root, artifactRecord }),
        reason,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("Core resolved by the SDK cannot be shadowed by a different local artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "moo-astro-shadow-"));
  try {
    await writeReleaseFixture(root);
    const sdk = join(root, "packages/astro");
    await mkdir(join(sdk, "node_modules/@wpmoo"), { recursive: true });
    await writeFile(join(sdk, "package.json"), JSON.stringify(packageJson));
    const shadow = join(sdk, "node_modules/@wpmoo/ui");
    await cp(join(root, "node_modules/@wpmoo/ui"), shadow, { recursive: true });
    const file = join(shadow, "dist/js/sidebar.js");
    await writeFile(file, `${await readFile(file, "utf8")}\n `);
    await assert.rejects(
      () =>
        assertCoreArtifact({
          repoRoot: root,
          artifactRecord: JSON.parse(
            readFileSync(
              join(SDK_ROOT, "contracts/ui-1.1.0-package.json"),
              "utf8",
            ),
          ),
        }),
      /sidebar\.js.*artifact hash/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertPackageCompatibility,
  assertReleasePin,
  developmentInstallCommand,
  installDevelopmentPackage,
  checkRelease,
} from "../scripts/sync_package_baseline.mjs";

const packageJson = {
  dependencies: {
    "@wpmoo/ui": "1.0.0-rc.8",
  },
};

const packageLock = {
  lockfileVersion: 3,
  packages: {
    "": packageJson,
    "node_modules/@wpmoo/ui": {
      version: "1.0.0-rc.8",
      resolved: "https://registry.npmjs.org/@wpmoo/ui/-/ui-1.0.0-rc.8.tgz",
      integrity: "sha512-test",
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

async function writeProject(root, lock = packageLock) {
  await writeFile(join(root, "package.json"), `${JSON.stringify(packageJson)}\n`);
  await writeFile(join(root, "package-lock.json"), `${JSON.stringify(lock)}\n`);
}

test("development install never rewrites tracked dependency inputs", async () => {
  assert.deepEqual(developmentInstallCommand("/tmp/ui.tgz"), [
    "install",
    "--no-save",
    "--package-lock=false",
    "--ignore-scripts",
    "--force",
    "/tmp/ui.tgz",
  ]);

  const root = await mkdtemp(join(tmpdir(), "moo-astro-baseline-"));
  try {
    await writeProject(root);
    const beforePackage = await readFile(join(root, "package.json"), "utf8");
    const beforeLock = await readFile(join(root, "package-lock.json"), "utf8");
    await mkdir(join(root, "node_modules/.vite"), { recursive: true });
    await writeFile(join(root, "node_modules/keep.txt"), "keep");
    const commands = [];

    await installDevelopmentPackage({
      tarball: "/tmp/ui.tgz",
      astroRoot: root,
      runner: async (command, options) => {
        commands.push({ command, options });
      },
    });

    assert.deepEqual(commands[0].command, ["npm", ...developmentInstallCommand("/tmp/ui.tgz")]);
    assert.equal(commands[0].options.cwd, root);
    assert.equal(await readFile(join(root, "package.json"), "utf8"), beforePackage);
    assert.equal(await readFile(join(root, "package-lock.json"), "utf8"), beforeLock);
    await assert.rejects(() => readFile(join(root, "node_modules/.vite")));
    assert.equal(await readFile(join(root, "node_modules/keep.txt"), "utf8"), "keep");
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

test("package compatibility rejects a different package name or version", () => {
  assert.doesNotThrow(() =>
    assertPackageCompatibility({
      packageName: "@wpmoo/ui",
      packageVersion: "1.0.0-rc.8",
      packageJson,
    }),
  );
  assert.throws(
    () =>
      assertPackageCompatibility({
        packageName: "@other/ui",
        packageVersion: "1.0.0-rc.8",
        packageJson,
      }),
    /package name/,
  );
  assert.throws(
    () =>
      assertPackageCompatibility({
        packageName: "@wpmoo/ui",
        packageVersion: "1.0.0-rc.7",
        packageJson,
      }),
    /package version/,
  );
});

test("release checking is read-only and never runs npm or a layout writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "moo-astro-release-"));
  try {
    await writeProject(root);
    let invoked = false;
    await checkRelease({
      astroRoot: root,
      runner: async () => {
        invoked = true;
        throw new Error("npm/layout writer must not run");
      },
    });
    assert.equal(invoked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

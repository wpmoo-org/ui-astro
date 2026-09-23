#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
export const ASTRO_ROOT = resolve(SCRIPT_ROOT, "..");
export const MOO_PACKAGE_NAME = "@wpmoo/ui";

function declaredPackageVersion(packageJson) {
  const version = packageJson?.dependencies?.[MOO_PACKAGE_NAME];
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`package.json must declare ${MOO_PACKAGE_NAME} in dependencies`);
  }
  return version;
}

export function developmentInstallCommand(tarball) {
  return [
    "install",
    "--no-save",
    "--package-lock=false",
    "--ignore-scripts",
    "--force",
    tarball,
  ];
}

export function assertPackageCompatibility({ packageName, packageVersion, packageJson }) {
  if (packageName !== MOO_PACKAGE_NAME) {
    throw new Error(`package name ${packageName} is not compatible; expected ${MOO_PACKAGE_NAME}`);
  }
  const declaredVersion = declaredPackageVersion(packageJson);
  if (packageVersion !== declaredVersion) {
    throw new Error(
      `package version ${packageVersion} is not compatible with declared ${declaredVersion}`,
    );
  }
}

export function assertReleasePin({ packageJson, packageLock }) {
  const expectedVersion = declaredPackageVersion(packageJson);
  if (!/^\d+\.\d+\.\d+-rc\.\d+$/.test(expectedVersion)) {
    throw new Error(`declared ${MOO_PACKAGE_NAME} version is not an RC release pin`);
  }
  const installed = packageLock?.packages?.[`node_modules/${MOO_PACKAGE_NAME}`];
  if (!installed || typeof installed !== "object") {
    throw new Error(`package-lock.json is missing node_modules/${MOO_PACKAGE_NAME}`);
  }
  if (installed.version !== expectedVersion) {
    throw new Error(
      `package-lock.json pins ${installed.version ?? "no version"}, expected ${expectedVersion}`,
    );
  }
  if (String(installed.resolved ?? "").startsWith("file:")) {
    throw new Error("file dependency is not release-valid");
  }
  if (typeof installed.resolved !== "string" || installed.resolved.length === 0) {
    throw new Error("release package lock must contain a registry resolved URL");
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function projectMetadata(astroRoot) {
  return {
    packageJson: await readJson(join(astroRoot, "package.json")),
    packageLock: await readJson(join(astroRoot, "package-lock.json")),
  };
}

function runCommand(command, { cwd }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command[0]} exited with ${signal ?? `status ${code}`}`));
    });
  });
}

export async function installDevelopmentPackage({
  tarball,
  astroRoot = ASTRO_ROOT,
  runner = runCommand,
}) {
  const { packageJson } = await projectMetadata(astroRoot);
  const declaredVersion = declaredPackageVersion(packageJson);
  assertPackageCompatibility({
    packageName: MOO_PACKAGE_NAME,
    packageVersion: declaredVersion,
    packageJson,
  });
  await runner(["npm", ...developmentInstallCommand(tarball)], { cwd: astroRoot });
  await rm(join(astroRoot, "node_modules/.vite"), {
    recursive: true,
    force: true,
  });
}

export async function checkPackage({
  packageName,
  packageVersion,
  astroRoot = ASTRO_ROOT,
}) {
  const { packageJson } = await projectMetadata(astroRoot);
  assertPackageCompatibility({ packageName, packageVersion, packageJson });
}

export async function checkRelease({ astroRoot = ASTRO_ROOT } = {}) {
  const { packageJson, packageLock } = await projectMetadata(astroRoot);
  assertReleasePin({ packageJson, packageLock });
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--check-release")) {
    await checkRelease();
    console.log("Moo UI Astro release package pin: OK");
    return;
  }
  if (args.includes("--check-package")) {
    const packageName = argumentValue(args, "--package-name");
    const packageVersion = argumentValue(args, "--package-version");
    if (!packageName || !packageVersion) {
      throw new Error("--check-package requires --package-name and --package-version");
    }
    await checkPackage({ packageName, packageVersion });
    console.log("Moo UI Astro package compatibility: OK");
    return;
  }
  if (argumentValue(args, "--mode") === "dev") {
    const tarball = argumentValue(args, "--package-tarball");
    if (!tarball) {
      throw new Error("--mode dev requires --package-tarball");
    }
    await installDevelopmentPackage({ tarball });
    console.log("Moo UI Astro development package installed");
    return;
  }
  throw new Error(
    "Usage: node scripts/sync_package_baseline.mjs --mode dev --package-tarball PATH | --check-package --package-name NAME --package-version VERSION | --check-release",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Astro package baseline: ${error.message}`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  SDK_ROOT,
  projectPaths,
  corePackageRoot,
} from "./project-paths.mjs";

export const ASTRO_ROOT = REPO_ROOT;
export const MOO_PACKAGE_NAME = "@wpmoo/ui";
const RELEASE_RECORD = JSON.parse(
  readFileSync(join(SDK_ROOT, "contracts/ui-1.0.0-package.json"), "utf8"),
);

function declaredPackageVersion(packageJson) {
  const version = packageJson?.dependencies?.[MOO_PACKAGE_NAME];
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(
      `package.json must declare ${MOO_PACKAGE_NAME} in dependencies`,
    );
  }
  return version;
}

export function developmentInstallCommand(tarball) {
  return [
    "install",
    "--workspace",
    "@wpmoo/astro",
    "--no-save",
    "--ignore-scripts",
    "--force",
    tarball,
  ];
}

export function assertPackageCompatibility({
  packageName,
  packageVersion,
  packageJson,
}) {
  if (packageName !== MOO_PACKAGE_NAME) {
    throw new Error(
      `package name ${packageName} is not compatible; expected ${MOO_PACKAGE_NAME}`,
    );
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
  if (expectedVersion !== RELEASE_RECORD.version) {
    throw new Error(
      `declared ${MOO_PACKAGE_NAME} version must be ${RELEASE_RECORD.version}`,
    );
  }
  if (
    packageLock?.packages?.["packages/astro"]?.dependencies?.[
      MOO_PACKAGE_NAME
    ] !== expectedVersion
  ) {
    throw new Error(
      "package-lock.json SDK workspace dependency differs from the release pin",
    );
  }
  const installed = packageLock?.packages?.[`node_modules/${MOO_PACKAGE_NAME}`];
  if (!installed || typeof installed !== "object") {
    throw new Error(
      `package-lock.json is missing node_modules/${MOO_PACKAGE_NAME}`,
    );
  }
  if (installed.version !== expectedVersion) {
    throw new Error(
      `package-lock.json pins ${installed.version ?? "no version"}, expected ${expectedVersion}`,
    );
  }
  if (String(installed.resolved ?? "").startsWith("file:")) {
    throw new Error("file dependency is not release-valid");
  }
  if (installed.resolved !== RELEASE_RECORD.registry_url) {
    throw new Error(
      "release package lock registry URL differs from Core release",
    );
  }
  if (installed.integrity !== RELEASE_RECORD.integrity) {
    throw new Error("release package lock integrity differs from Core release");
  }
}

export async function assertCoreArtifact({
  repoRoot = ASTRO_ROOT,
  artifactRecord = RELEASE_RECORD,
} = {}) {
  const coreRoot = corePackageRoot(repoRoot);
  const installed = await readJson(join(coreRoot, "package.json"));
  if (
    installed.name !== artifactRecord.package ||
    installed.version !== artifactRecord.version
  ) {
    throw new Error(
      "installed Moo UI package identity differs from Core release",
    );
  }
  const expectedExports = Object.fromEntries(
    Object.entries(artifactRecord.exports).map(([name, entry]) => [
      name,
      entry.target,
    ]),
  );
  if (JSON.stringify(installed.exports) !== JSON.stringify(expectedExports)) {
    throw new Error(
      "installed Moo UI public export map differs from Core release",
    );
  }
  for (const [name, entry] of Object.entries(artifactRecord.exports)) {
    const target = join(coreRoot, entry.target);
    const bytes = await readFile(target).catch(() => {
      throw new Error(`installed Moo UI ${name} target is missing`);
    });
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== entry.sha256) {
      throw new Error(
        `installed Moo UI ${name} artifact hash differs from Core release`,
      );
    }
  }
}

export function assertDevelopmentPin({
  packageJson,
  packageLock,
  artifactRecord,
}) {
  if (
    artifactRecord.artifact_kind !== "local-development" ||
    artifactRecord.package !== MOO_PACKAGE_NAME ||
    !/^\d+\.\d+\.\d+-dev\.\d+$/.test(artifactRecord.version)
  )
    throw new Error("identified local development artifact required");
  const locked = packageLock.packages?.[`node_modules/${MOO_PACKAGE_NAME}`];
  if (
    declaredPackageVersion(packageJson) !== artifactRecord.version ||
    packageLock.packages?.["packages/astro"]?.dependencies?.[
      MOO_PACKAGE_NAME
    ] !== artifactRecord.version ||
    locked?.version !== artifactRecord.version ||
    locked?.integrity !== artifactRecord.integrity ||
    !String(locked?.resolved).startsWith("file:") ||
    !String(locked?.resolved).endsWith(`/${artifactRecord.artifact_filename}`)
  )
    throw new Error(
      "development pin differs from the identified local artifact",
    );
}

export async function checkDevelopment({
  tarball,
  artifactRecord,
  repoRoot = ASTRO_ROOT,
}) {
  const bytes = await readFile(tarball);
  if (
    createHash("sha256").update(bytes).digest("hex") !==
      artifactRecord.tarball_sha256 ||
    `sha512-${createHash("sha512").update(bytes).digest("base64")}` !==
      artifactRecord.integrity
  )
    throw new Error(
      "development tarball bytes differ from the identified artifact",
    );
  const metadata = await projectMetadata(repoRoot);
  assertDevelopmentPin({ ...metadata, artifactRecord });
  await assertCoreArtifact({ repoRoot, artifactRecord });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function projectMetadata(repoRoot) {
  return {
    packageJson: await readJson(
      join(projectPaths(repoRoot).sdkRoot, "package.json"),
    ),
    packageLock: await readJson(join(repoRoot, "package-lock.json")),
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
      reject(
        new Error(`${command[0]} exited with ${signal ?? `status ${code}`}`),
      );
    });
  });
}

export async function installDevelopmentPackage({
  tarball,
  repoRoot = ASTRO_ROOT,
  runner = runCommand,
}) {
  const { packageJson } = await projectMetadata(repoRoot);
  const declaredVersion = declaredPackageVersion(packageJson);
  assertPackageCompatibility({
    packageName: MOO_PACKAGE_NAME,
    packageVersion: declaredVersion,
    packageJson,
  });
  await runner(["npm", ...developmentInstallCommand(tarball)], {
    cwd: repoRoot,
  });
  for (const root of [repoRoot, projectPaths(repoRoot).demoRoot]) {
    await rm(join(root, "node_modules/.vite"), {
      recursive: true,
      force: true,
    });
  }
}

export async function checkPackage({
  packageName,
  packageVersion,
  repoRoot = ASTRO_ROOT,
}) {
  const { packageJson } = await projectMetadata(repoRoot);
  assertPackageCompatibility({ packageName, packageVersion, packageJson });
}

export async function checkRelease({ repoRoot = ASTRO_ROOT } = {}) {
  const { packageJson, packageLock } = await projectMetadata(repoRoot);
  assertReleasePin({ packageJson, packageLock });
  await assertCoreArtifact({ repoRoot });
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--check-development")) {
    const tarball = argumentValue(args, "--package-tarball");
    const recordPath = argumentValue(args, "--artifact-record");
    if (!tarball || !recordPath)
      throw new Error(
        "development check requires --package-tarball and --artifact-record",
      );
    await checkDevelopment({
      tarball,
      artifactRecord: await readJson(recordPath),
    });
    console.log("Moo UI Astro identified development artifact: OK");
    return;
  }
  if (args.includes("--check-release")) {
    await checkRelease();
    console.log("Moo UI Astro release package pin: OK");
    return;
  }
  if (args.includes("--check-package")) {
    const packageName = argumentValue(args, "--package-name");
    const packageVersion = argumentValue(args, "--package-version");
    if (!packageName || !packageVersion) {
      throw new Error(
        "--check-package requires --package-name and --package-version",
      );
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

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function projectPaths(repoRoot = REPO_ROOT) {
  return {
    repoRoot,
    sdkRoot: join(repoRoot, "packages/astro"),
    demoRoot: join(repoRoot, "apps/demo"),
    consumerRoot: join(repoRoot, "apps/consumer"),
  };
}

export const { sdkRoot: SDK_ROOT, demoRoot: DEMO_ROOT, consumerRoot: CONSUMER_ROOT } = projectPaths();

export function corePackageRoot(repoRoot = REPO_ROOT) {
  const sdk = createRequire(join(projectPaths(repoRoot).sdkRoot, "package.json"));
  return dirname(sdk.resolve("@wpmoo/ui/package.json"));
}

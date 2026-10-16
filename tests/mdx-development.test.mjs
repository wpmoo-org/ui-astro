import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Retain the confirmed MDX development asset regression in the SDK demo.
test("demo_mdx_development_assets_load", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./mdx-development-graph.mjs", import.meta.url)),
      "demo",
    ],
    {
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(
    result.status,
    0,
    `${result.stdout}${result.stderr}${result.error?.message ?? ""}`,
  );
  assert.ok(result.stdout.includes("demo/en: development asset graph loaded"));
});

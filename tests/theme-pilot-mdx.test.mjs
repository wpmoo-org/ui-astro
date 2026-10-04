import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Catches server context dependencies being re-resolved from an MDX asset
// boundary in dev, which a successful static build does not exercise.
for (const main of ["en", "de"]) {
  test(`pilot_mdx_development_assets_load_with_${main}_main_language`, () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./theme-pilot-mdx-graph.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          PILOT_MAIN_LANGUAGE: main,
          PILOT_CATEGORY_PROFILE: "category",
          ASTRO_TELEMETRY_DISABLED: "1",
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.equal(
      result.status,
      0,
      `${result.stdout}${result.stderr}${result.error?.message ?? ""}`,
    );
    for (const locale of ["en", "de"])
      assert.ok(
        result.stdout.includes(
          `${main}/${locale}: development asset graph loaded`,
        ),
      );
  });
}

test("demo_mdx_development_assets_load", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./theme-pilot-mdx-graph.mjs", import.meta.url)),
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

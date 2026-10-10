import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REPO_ROOT, SDK_ROOT, DEMO_ROOT } from "../scripts/project-paths.mjs";
import { join } from "node:path";

const read = async (root, file) =>
  JSON.parse(await readFile(join(root, file), "utf8"));
const manifest = await read(SDK_ROOT, "package.json");
const root = await read(REPO_ROOT, "package.json");
const demo = await read(DEMO_ROOT, "package.json");
const lock = await read(REPO_ROOT, "package-lock.json");

test("the host supplies the exact certified Astro peer and development uses that version", () => {
  assert.equal(manifest.peerDependencies?.astro, "7.3.3");
  assert.deepEqual(manifest.devDependencies, {});
  assert.equal(manifest.dependencies.astro, undefined);
  assert.equal(
    lock.packages["packages/astro"].peerDependencies?.astro,
    "7.3.3",
  );
  assert.equal(root.devDependencies.astro, "7.3.3");
  assert.equal(demo.dependencies.astro, "7.3.3");
  assert.equal(lock.packages["node_modules/astro"].version, "7.3.3");
});

test("shared checker tools and host MDX never become SDK dependencies", () => {
  assert.deepEqual(root.devDependencies, {
    "@astrojs/check": "0.9.10",
    astro: "7.3.3",
    typescript: "6.0.3",
  });
  assert.deepEqual(demo.devDependencies, { "@astrojs/mdx": "8.0.2" });
  assert.deepEqual(demo.dependencies, {
    "@wpmoo/astro": "0.1.0",
    astro: "7.3.3",
  });
  assert.deepEqual(lock.packages[""].devDependencies, root.devDependencies);
  assert.deepEqual(lock.packages["apps/demo"].dependencies, demo.dependencies);
  assert.deepEqual(
    lock.packages["apps/demo"].devDependencies,
    demo.devDependencies,
  );
  for (const [name, version] of Object.entries({
    ...root.devDependencies,
    ...demo.devDependencies,
  })) {
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version);
    assert.equal(manifest.dependencies[name], undefined);
  }
  assert.deepEqual(manifest.dependencies, {
    "@wpmoo/ui": "1.1.0",
    bootstrap: "5.3.8",
  });
});

test("only development apps use workspace linking; the consumer remains independent", () => {
  assert.equal(root.private, true);
  assert.equal(demo.private, true);
  assert.deepEqual(root.workspaces, ["packages/*", "apps/demo"]);
  assert.deepEqual(lock.packages["node_modules/@wpmoo/astro"], {
    resolved: "packages/astro",
    link: true,
  });
  assert.equal(lock.packages["apps/consumer"], undefined);
});

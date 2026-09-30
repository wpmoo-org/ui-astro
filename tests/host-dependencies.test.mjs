import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

test("the host supplies the exact certified Astro peer and local checks use that same version", () => {
  assert.equal(manifest.peerDependencies?.astro, "7.3.3");
  assert.equal(manifest.devDependencies?.astro, "7.3.3");
  assert.equal(manifest.dependencies.astro, undefined);
  assert.equal(lock.packages[""].peerDependencies?.astro, "7.3.3");
  assert.equal(lock.packages[""].devDependencies?.astro, "7.3.3");
  assert.equal(lock.packages["node_modules/astro"].version, "7.3.3");
});

test("the approved checker tools are exact development pins and MDX stays an explicit host opt-in", () => {
  assert.equal(manifest.scripts.check, "astro check");
  for (const [name, version] of Object.entries({
    "@astrojs/check": "0.9.10", typescript: "6.0.3", "@astrojs/mdx": "8.0.2",
  })) {
    assert.equal(manifest.devDependencies?.[name], version);
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version);
    assert.equal(manifest.dependencies[name], undefined);
    assert.equal(manifest.peerDependencies?.[name], undefined);
  }
  assert.equal(manifest.dependencies["@wpmoo/ui"], "1.0.0-rc.9");
  assert.equal(manifest.dependencies.bootstrap, "5.3.8");
});

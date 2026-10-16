import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2];
assert.ok(root, "Pass the native placements fixture dist directory");
const page = await readFile(join(root, "index.html"), "utf8");
const headings = [...page.matchAll(/<h[1-6][^>]* id="([^"]+)"/g)].map(
  (match) => match[1],
);
assert.equal(
  headings.length,
  new Set(headings).size,
  "unique native block heading IDs",
);
assert.equal(
  headings.filter((id) => id.endsWith("-reusable-native-content")).length,
  2,
);
assert.equal([...page.matchAll(/>MDX assets<\/section>/g)].length, 2);
let assets = page;
for (const file of await readdir(join(root, "_astro"))) {
  if (/\.(?:js|css)$/.test(file))
    assets += await readFile(join(root, "_astro", file), "utf8");
}
assert.match(assets, /native-fixture-asset/);
assert.match(assets, /nativeFixtureAsset/);
assert.doesNotMatch(
  await readFile(join(root, "de/index.html"), "utf8"),
  /MDX assets/,
);
assert.match(await readFile(join(root, "404.html"), "utf8"), /Page not found/);

const multiple = await readFile(
  join(root, "frames/multiple/index.html"),
  "utf8",
);
const targets = [...multiple.matchAll(/data-bs-target="#([^"]+)"/g)].map(
  (match) => match[1],
);
assert.equal(targets.length, 2);
assert.equal(
  new Set(targets).size,
  2,
  "independent aside disclosures have unique targets",
);
for (const target of targets)
  assert.equal(multiple.split(`id="${target}"`).length - 1, 1);

for (const name of [
  "left",
  "right-rtl",
  "stack-after",
  "hidden",
  "long",
  "empty",
]) {
  const html = await readFile(join(root, "frames", name, "index.html"), "utf8");
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const mainIndex = withoutScripts.indexOf("<article");
  const asideIndex = withoutScripts.indexOf("<aside");
  if (name === "empty") {
    assert.equal(asideIndex, -1, "no empty aside column");
    continue;
  }
  assert.ok(mainIndex >= 0 && asideIndex >= 0);
  assert.equal(
    [...html.matchAll(/id="frame-[^"]+-callout"/g)].length,
    1,
    "one buffered native body",
  );
  if (["stack-after", "hidden"].includes(name)) {
    assert.ok(mainIndex < asideIndex, `${name} reads after main content`);
  } else {
    assert.ok(
      asideIndex < mainIndex,
      `${name}: collapse-before DOM reading order matches mobile presentation`,
    );
  }
  assert.match(
    html,
    /native-fixture-asset/,
    "buffered aside preserves scoped style",
  );
}
console.log(
  "Native placements assets, repeated IDs, drafts, UI-only 404 and accessible frame order: passed",
);

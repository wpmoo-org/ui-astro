import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
const root = process.argv[2];
assert.ok(root, "Pass a built starter dist directory");
const withoutScripts = (html) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const page = withoutScripts(
  await readFile(join(root, "placement-guide/index.html"), "utf8").catch(() =>
    readFile(join(root, "enhanced/index.html"), "utf8"),
  ),
);
assert.match(page, /data-site-drawer="left"/);
assert.doesNotMatch(page, /data-slot="sidebar-wrapper"/);
assert.match(page, /data-content-aside="right"/);
assert.match(page, /data-toc="true"/);
assert.match(page, /href="#intro"/);
assert.match(page, /Reusable callout/);
for (const element of ["html", "head", "body", "main"])
  assert.equal(
    [...page.matchAll(new RegExp(`<${element}(?:>|\\s)`, "g"))].length,
    1,
    `one ${element}`,
  );
const german = await readFile(
  join(root, "de/platzierungen/index.html"),
  "utf8",
);
assert.match(german, /Wiederverwendbarer Hinweis/);
assert.doesNotMatch(german, /Reusable callout/);
assert.match(german, /Auf dieser Seite/);
assert.match(german, /href="\/de\/kategorie\/anleitungen"/);
const plain = await readFile(join(root, "about/index.html"), "utf8");
assert.doesNotMatch(plain, /data-content-aside/);
assert.match(plain, /data-entry-taxonomies/);
const archive = await readFile(join(root, "blog/index.html"), "utf8");
assert.doesNotMatch(archive, /data-content-aside/);
const missing = await readFile(join(root, "404.html"), "utf8");
assert.match(missing, /data-site-drawer/);
assert.doesNotMatch(missing, /data-entry-taxonomies/);
console.log(
  "Starter placement/locale/default terms/drawer/TOC/empty aside/document ownership: passed",
);

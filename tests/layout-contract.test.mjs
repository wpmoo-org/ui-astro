import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, sidebar, index, snapshot] = await Promise.all([
  readFile(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8"),
  readFile(new URL("../src/components/Sidebar.astro", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8"),
  readFile(new URL("../contracts/layout-surface.snapshot.json", import.meta.url), "utf8"),
]);

const layoutSnapshot = JSON.parse(snapshot);

test("Layout exposes the RC8 app/page sibling topology", () => {
  assert.doesNotMatch(layout, /import .*Sidebar\.astro/);
  assert.doesNotMatch(layout, /sidebar-inset/);
  assert.match(layout, /type Navigation = "sidebar" \| "none"/);
  assert.match(layout, /Astro\.slots\.has\("sidebar"\)/);
  assert.match(layout, /data-layout="app"/);
  assert.match(layout, /data-slot="sidebar-wrapper"/);
  assert.match(layout, /slot name="sidebar"/);
  assert.match(layout, /data-slot="page"/);
  assert.match(layout, /id="main-content" tabindex="-1"/);
});

test("Layout owns the Moo UI theme boundary", () => {
  assert.match(layout, /<html lang="en">/);
  assert.match(layout, /<body>/);
  assert.match(layout, /type Theme = "light" \| "dark"/);
  assert.match(layout, /theme\?: Theme/);
  assert.match(
    layout,
    /<div class="moo-ui" data-bs-theme=\{theme\} data-moo-document-owner="true">/
  );
  assert.match(layout, /<div class="wrapper" data-layout="app"/);
  assert.doesNotMatch(layout, /class="moo-ui wrapper"/);
});

test("Layout implements the stamped HTML app/page surface", () => {
  assert.deepEqual(layoutSnapshot.registry.map((entry) => entry.slug), ["app", "page"]);
  assert.deepEqual(layoutSnapshot.layout_surface.app.navigation, ["sidebar", "none"]);
  assert.deepEqual(layoutSnapshot.layout_surface.app.shell_mode, ["viewport", "contained"]);
  assert.deepEqual(layoutSnapshot.layout_surface.page.regions, ["header", "main", "footer"]);
  assert.match(layout, /data-slot="sidebar-wrapper"/);
  assert.match(layout, /data-slot="page"/);
  assert.match(layout, /<main id="main-content" tabindex="-1"/);
  assert.match(layout, /ariaLabel = "Toggle sidebar"/);
  assert.match(layout, /aria-label=\{ariaLabel\}/);
  assert.doesNotMatch(layout, /sidebar-inset/);
});

test("Sidebar is only the direct aside branch", () => {
  assert.match(sidebar, /<aside[\s\S]*data-slot="sidebar"/);
  assert.match(sidebar, /slot:\s*_slot/);
  assert.doesNotMatch(sidebar, /sidebar-wrapper/);
  assert.doesNotMatch(sidebar, /slot="main"/);
  assert.doesNotMatch(sidebar, /showTrigger/);
});

test("the smoke page composes the public Sidebar through Layout", () => {
  assert.match(index, /import Sidebar from "\.\.\/components\/Sidebar\.astro"/);
  assert.match(index, /navigation="sidebar"/);
  assert.match(index, /theme="dark"/);
  assert.match(index, /<Sidebar[\s\S]*slot="sidebar"/);
  assert.doesNotMatch(index, /sidebar="(?:none|sidebar|floating|inset)"/);
});

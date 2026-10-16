import assert from "node:assert/strict";
import test from "node:test";
import {
  defineSite,
  resolvePageOptions,
} from "../packages/astro/src/config/index.js";

test("legacy app sidebar keeps its exact resolved contract", () => {
  assert.deepEqual(defineSite({ defaults: { sidebar: {} } }).defaults.sidebar, {
    side: "left",
    variant: "sidebar",
    collapsible: "icon",
    rail: true,
    defaultOpen: true,
  });
});
test("drawer defaults are distinct from app sidebar preferences", () => {
  const site = defineSite({ defaults: { sidebar: { mode: "drawer" } } });
  assert.deepEqual(site.defaults.sidebar, { mode: "drawer", side: "left" });
  assert.equal(Object.isFrozen(site.defaults.sidebar), true);
});
test("mode changes reset incompatible inherited settings and side-only updates inherit mode", () => {
  const site = defineSite({
    defaults: { sidebar: { side: "right", variant: "inset", rail: false } },
    types: { page: { sidebar: { mode: "drawer" } } },
  });
  assert.deepEqual(resolvePageOptions(site, "page", "single").sidebar, {
    mode: "drawer",
    side: "left",
  });
  assert.deepEqual(
    resolvePageOptions(site, "page", "single", { sidebar: { side: "right" } })
      .sidebar,
    { mode: "drawer", side: "right" },
  );
  assert.deepEqual(
    resolvePageOptions(site, "page", "single", { sidebar: { mode: "sidebar" } })
      .sidebar,
    {
      mode: "sidebar",
      side: "left",
      variant: "sidebar",
      collapsible: "icon",
      rail: true,
      defaultOpen: true,
    },
  );
  assert.equal(
    resolvePageOptions(site, "page", "single", { sidebar: null }).sidebar,
    null,
  );
});
test("drawer rejects explicit app fields including later inherited overrides", () => {
  for (const field of [
    { rail: true },
    { variant: "inset" },
    { defaultOpen: true },
    { collapsible: "offcanvas" },
  ]) {
    assert.throws(
      () => defineSite({ defaults: { sidebar: { mode: "drawer", ...field } } }),
      /drawer|sidebar/,
    );
    const site = defineSite({ defaults: { sidebar: { mode: "drawer" } } });
    assert.throws(
      () => resolvePageOptions(site, "page", "single", { sidebar: field }),
      /drawer/,
    );
  }
});

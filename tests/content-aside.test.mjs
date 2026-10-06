import assert from "node:assert/strict";
import test from "node:test";
import {
  defineSite,
  resolvePageOptions,
} from "../packages/astro/src/config/index.js";

test("content aside is optional and resolves its independent defaults", () => {
  const site = defineSite({
    defaults: { sidebar: { mode: "drawer" }, aside: {} },
  });
  assert.deepEqual(site.defaults.aside, {
    side: "right",
    columns: 3,
    breakpoint: "xl",
    sticky: false,
    mobile: "collapse-before",
  });
  assert.equal(Object.isFrozen(site.defaults.aside), true);
  const override = resolvePageOptions(site, "page", "single", {
    sidebar: null,
    aside: { side: "left", columns: 4, sticky: true },
  });
  assert.equal(override.sidebar, null);
  assert.equal(override.aside.columns, 4);
  assert.equal(override.aside.side, "left");
  assert.equal(
    resolvePageOptions(site, "page", "single", { aside: null }).aside,
    null,
  );
});
test("aside contract rejects unsupported sizes and modes", () => {
  for (const aside of [
    { columns: 1 },
    { columns: 7 },
    { columns: 2.5 },
    { breakpoint: "md" },
    { side: "start" },
    { mobile: "drawer" },
    { sticky: "yes" },
    { width: "300px" },
  ])
    assert.throws(() => defineSite({ defaults: { aside } }), /aside/);
});
test("native frame classes account for physical side, RTL and mobile policy", async () => {
  const module =
    await import("../packages/astro/src/layouts/content-frame.js").catch(
      () => ({}),
    );
  assert.equal(typeof module.contentFrameClasses, "function");
  const aside = defineSite({ defaults: { aside: {} } }).defaults.aside;
  const ltr = module.contentFrameClasses(aside, "ltr");
  const rtl = module.contentFrameClasses(aside, "rtl");
  assert.equal(ltr.main.includes("col-xl-9"), true);
  assert.equal(ltr.aside.includes("col-xl-3"), true);
  assert.equal(ltr.aside.includes("order-xl-2"), true);
  assert.equal(rtl.aside.includes("order-xl-1"), true);
  assert.equal(ltr.aside.includes("order-1"), true);
  assert.equal(
    module
      .contentFrameClasses({ ...aside, mobile: "stack-after" }, "ltr")
      .aside.includes("order-2"),
    true,
  );
});

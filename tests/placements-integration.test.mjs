import assert from "node:assert/strict";
import test from "node:test";
import moo from "../packages/astro/src/integration/index.js";
import { defineSite } from "../packages/astro/src/config/index.js";
import { normalizePlacements } from "../packages/astro/src/placements/options.js";

const file = new URL("../apps/demo/components/Hero.astro", import.meta.url);
const data = {
  blocks: { hero: { component: file } },
  placements: [{ id: "hero", block: "hero", at: "header.after" }],
};
test("moo accepts placement options without importing an Astro factory in Node", () => {
  const integration = moo({ ...data });
  assert.equal(integration.name, "@wpmoo/astro");
});

test("factory virtual module is server-only and private to the public preparation facade", async () => {
  const module = await import("../packages/astro/src/placements/vite.js").catch(
    (error) => {
      if (error.code === "ERR_MODULE_NOT_FOUND") return {};
      throw error;
    },
  );
  assert.equal(typeof module.placementVitePlugin, "function");
  const plugin = module.placementVitePlugin(() => ({
    ...normalizePlacements(data),
    site: defineSite(),
    i18n: null,
    types: [],
    taxonomies: [],
    active: false,
  }));
  const id = "virtual:wpmoo-astro/placements";
  const facade = new URL(
    "../packages/astro/src/placements/index.js",
    import.meta.url,
  ).pathname;
  assert.throws(
    () => plugin.resolveId(id, facade, { ssr: false }),
    /server-only/,
  );
  assert.throws(
    () => plugin.resolveId(id, "/host/entry.mdx", { ssr: true }),
    /private/,
  );
  assert.equal(plugin.resolveId(id, facade + "?v=1", { ssr: true }), "\0" + id);
  const code = plugin.load("\0" + id, { ssr: true });
  assert.match(code, /import Block0 from/);
  assert.match(code, /export const factories/);
  assert.doesNotMatch(code, /hostContentConfig.*null/);
  assert.throws(() => plugin.load("\0" + id, { ssr: false }), /server-only/);
});

test("registered conditions reject unknown type, taxonomy and locale references", async () => {
  const module = await import("../packages/astro/src/placements/vite.js").catch(
    () => ({}),
  );
  assert.equal(typeof module.validatePlacementRegistry, "function");
  for (const include of [
    { types: ["unknown"] },
    { terms: { unknown: ["term"] } },
    { locales: ["tr"] },
  ]) {
    const profile = {
      ...normalizePlacements({
        placements: [{ id: "toc", block: "toc", at: "aside.content", include }],
      }),
      site: defineSite(),
      i18n: null,
      types: ["page"],
      taxonomies: [],
    };
    assert.throws(
      () => module.validatePlacementRegistry(profile),
      /toc.*unknown|toc.*tr/i,
    );
  }
});

test("a missing component names its block before native import resolution", async () => {
  const { placementVitePlugin } =
    await import("../packages/astro/src/placements/vite.js");
  const profile = {
    ...normalizePlacements({
      blocks: {
        missing: { component: new URL("./missing.astro", import.meta.url) },
      },
    }),
    site: defineSite(),
    active: false,
  };
  assert.throws(
    () =>
      placementVitePlugin(() => profile).load(
        "\0virtual:wpmoo-astro/placements",
        { ssr: true },
      ),
    /Block missing.*component.*missing\.astro/i,
  );
});

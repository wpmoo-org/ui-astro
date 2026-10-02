import assert from "node:assert/strict";
import * as factory from "@wpmoo-test/astro-content";
import * as content from "@wpmoo-test/astro-content/content";
import {
  getEntryClasses,
  resolvePageOptions,
  defineSite,
} from "@wpmoo/astro/config";

assert.deepEqual(Object.keys(factory), ["sample"]);
assert.deepEqual(Object.keys(content), ["sampleSchema"]);
const source = new URL("./src/data/sample.json", import.meta.url);
const descriptor = factory.sample({ source });
assert.equal(descriptor.apiVersion, 1);
assert.equal(descriptor.contentTypes[0].collection, "sample");
assert.deepEqual(descriptor.contentTypes[0].source, {
  kind: "json",
  file: source.href,
});
assert.equal(descriptor.routes.length, 2);
assert.ok(Object.isFrozen(descriptor.contentTypes[0]));
assert.equal(
  factory.sample({
    source: new URL("./src/data/sample/", import.meta.url),
    sourceKind: "json-directory",
  }).contentTypes[0].source.kind,
  "json-directory",
);
const parsed = content.sampleSchema.parse({
  id: "checked",
  title: "Checked",
  body: "Literal <text>.",
  status: "publish",
  options: {
    sidebar: null,
    headerWidth: null,
    parts: { content: { utilities: [] } },
  },
});
const preferences = resolvePageOptions(
  defineSite({
    defaults: { sidebar: {}, parts: { content: { utilities: ["py-4"] } } },
  }),
  "sample",
  "single",
  parsed.options,
);
assert.equal(preferences.sidebar, null);
assert.equal(preferences.headerWidth, null);
assert.deepEqual(preferences.parts.content.utilities, []);
assert.deepEqual(
  getEntryClasses({ type: "sample", id: parsed.id, source: "json" }),
  ["type-sample", "entry-sample--checked"],
);
assert.throws(
  () => factory.sample({ source, sourceKind: "markdown" }),
  /Sample sourceKind/,
);
assert.throws(
  () => factory.sample({ source, unsupported: true }),
  /Sample option unsupported/,
);

for (const name of [
  "routes/index.astro",
  "routes/[...slug].astro",
  "index.js",
  "package.json",
]) {
  await assert.rejects(import(`@wpmoo-test/astro-content/${name}`), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
}
// Server queries are intentionally unavailable to a plain Node configuration caller.
await assert.rejects(import("@wpmoo-test/astro-content/queries"), {
  code: "ERR_UNSUPPORTED_ESM_URL_SCHEME",
});
console.log(
  "External fixture pure namespaces, options, identity and private imports: OK",
);

import assert from "node:assert/strict";
import test from "node:test";

import moo from "../src/integration/index.js";
import { buildRegistry } from "../src/integration/registry.js";
import { page } from "../src/plugins/page/index.js";
import { post } from "../src/plugins/post/index.js";
import { getEntryClasses } from "../src/config/index.js";

const api = await import("@wpmoo/astro/taxonomies").catch(() => null);
const content = await import("@wpmoo/astro/taxonomies/content").catch(() => null);
const paths = await import("../src/taxonomies/paths.js").catch(() => null);
function definition(changes = {}) {
  assert.ok(api, "The exact public taxonomy factory must be available");
  return api.defineTaxonomy({ id: "category", label: "Categories", source: new URL("file:///tmp/category.json"), ...changes });
}
function term(id, changes = {}) {
  return { collection: "category", id, data: { id, name: id, slug: id, ...changes } };
}
function graph(entries, changes = {}, lang = "en") {
  assert.ok(paths, "The shared taxonomy graph validator must be available");
  return paths.validateTerms(definition(changes), entries, { lang });
}

test("taxonomy definition is a pure owned opt-in public contract", () => {
  const source = new URL("file:///tmp/category.json");
  const archive = { include: "descendants" };
  const taxonomy = definition({ source, hierarchical: true, archive });
  source.pathname = "/tmp/other.json";
  archive.include = "direct";
  assert.equal(taxonomy.source, "file:///tmp/category.json");
  assert.equal(taxonomy.sourceKind, "json");
  assert.equal(taxonomy.archive.include, "descendants");
  assert.ok(Object.isFrozen(taxonomy));
  assert.ok(Object.isFrozen(taxonomy.archive));
  assert.equal(definition().archive, false);
  assert.equal(definition().hierarchical, false);
  assert.equal(definition({ sourceKind: "json-directory", source: new URL("file:///tmp/terms/") }).sourceKind, "json-directory");
});

test("taxonomy factory rejects each unsupported source and field", () => {
  for (const [changes, diagnostic] of [
    [{ id: "Category" }, /taxonomy.id/],
    [{ label: " " }, /taxonomy.label/],
    [{ source: "file:///tmp/category.json" }, /taxonomy.source/],
    [{ source: new URL("https://example.test/category.json") }, /taxonomy.source/],
    [{ source: new URL("file:///tmp/category.json?mutable") }, /taxonomy.source/],
    [{ source: new URL("file:///tmp/terms/") }, /taxonomy.source/],
    [{ sourceKind: "json-directory" }, /taxonomy.source/],
    [{ sourceKind: "yaml" }, /taxonomy.sourceKind/],
    [{ hierarchical: "yes" }, /taxonomy.hierarchical/],
    [{ archive: { include: "descendants" } }, /taxonomy.archive.include.*hierarchical/],
    [{ archive: { include: "all" } }, /taxonomy.archive.include/],
    [{ archive: { unknown: true } }, /taxonomy.archive.unknown/],
    [{ unknown: true }, /taxonomy.unknown/],
  ]) assert.throws(() => definition(changes), diagnostic);
});

test("strict term schema keeps authored slugs and stable IDs", () => {
  assert.ok(content, "The pure public term schema must be available");
  assert.deepEqual(content.termSchema.parse({ id: "fruit", name: "Fruit", slug: "Äpfel", parent: "food" }),
    { id: "fruit", name: "Fruit", slug: "Äpfel", parent: "food" });
  for (const changes of [{ id: "Fruit" }, { name: " " }, { slug: "../unsafe" }, { slug: "a/b" }, { slug: "%2f" }, { slug: "!!!" }, { draft: true }]) {
    assert.equal(content.termSchema.safeParse({ id: "fruit", name: "Fruit", slug: "fruit", ...changes }).success, false);
  }
});

test("registry owns taxonomy collections and explicit active type bindings", () => {
  const category = definition();
  const registry = buildRegistry([page({ taxonomies: ["category"] }), post({ taxonomies: ["category"] })], { taxonomies: [category] });
  assert.deepEqual(registry.taxonomies, [category]);
  assert.throws(() => buildRegistry([page({ taxonomies: ["category"] })]), /page.*inactive taxonomy category/);
  assert.throws(() => buildRegistry([page()], { taxonomies: [category, category] }), /duplicate taxonomy category/);
  assert.throws(() => buildRegistry([page()], { taxonomies: [definition({ id: "page" })] }), /taxonomy page.*type|taxonomy page.*collection/);
});

test("one common archive route is optional and has one namespace owner", () => {
  const category = definition({ archive: {} });
  const tag = definition({ id: "tag", label: "Tags", source: new URL("file:///tmp/tag.json"), archive: {} });
  for (const [taxonomies, expected] of [[[], []], [[definition()], []], [[category, tag], ["/topics/[taxonomy]/[slug]"]]]) {
    const injected = [];
    moo({ plugins: [], taxonomies }).hooks["astro:config:setup"]({ command: "build", config: { root: new URL("file:///tmp/host/"), vite: {} },
      injectRoute(route) { injected.push(route.pattern); }, updateConfig() {}, addMiddleware() {} });
    assert.deepEqual(injected.filter(route => !route.startsWith("/__moo_content_integrity")), expected);
  }
  assert.equal(buildRegistry([], { taxonomies: [category], taxonomyBasePath: "/subjects/" }).routes[0].pattern, "/subjects/[taxonomy]/[slug]");
  assert.throws(() => moo({ plugins: [post({ basePath: "/topics" })], taxonomies: [category] }), /namespace.*topics/);
  for (const taxonomyBasePath of ["/", "/Topics", "/küche", "/topics/%2f", "/__moo_content_integrity"]) {
    assert.throws(() => moo({ plugins: [], taxonomyBasePath }), /taxonomyBasePath/);
  }
  assert.doesNotThrow(() => moo({ plugins: [post({ basePath: "/topics" })], taxonomies: [definition()] }));
});

test("all term IDs, canonical slugs and parent graphs validate without any archive", () => {
  const tree = graph([term("root"), term("child", { parent: "root" }), term("leaf", { parent: "child" })], { hierarchical: true });
  assert.deepEqual([...tree.keys()], ["child", "leaf", "root"]);
  assert.deepEqual([...graph([])], []);
  for (const [entries, changes, diagnostic] of [
    [[term("root"), term("root")], {}, /category.*duplicate.*root/],
    [[term("root"), term("other", { slug: "root" })], {}, /category.*root.*other.*root/],
    [[term("child", { parent: "missing" })], { hierarchical: true }, /category.*child.*parent missing/],
    [[term("root", { parent: "root" })], { hierarchical: true }, /category.*root.*parent.*itself/],
    [[term("a", { parent: "b" }), term("b", { parent: "a" })], { hierarchical: true }, /category.*cycle.*a.*b/],
    [[term("root", { parent: "other" })], {}, /category.*root.*parent.*flat/],
    [[{ ...term("root"), id: "different" }], {}, /category.*different.*id/],
    [[{ ...term("root"), collection: "tag" }], {}, /category.*collection/],
  ]) assert.throws(() => graph(entries, changes), diagnostic);
});

test("term URL normalization keeps IDs and raw slugs with collision evidence", () => {
  for (const [lang, slug, expected] of [["tr", "Çözümler", "cozumler"], ["de", "Äpfel", "aepfel"], ["de", "Straße", "strasse"]]) {
    const terms = graph([term("stable", { slug })], {}, lang);
    assert.equal(terms.get("stable").slug, slug);
    assert.equal(paths.termHref(definition(), terms.get("stable"), { lang, taxonomyBasePath: "/topics", base: "/docs", trailingSlash: "always" }), `/docs/topics/category/${expected}/`);
  }
  assert.throws(() => graph([term("street", { slug: "Straße" }), term("other", { slug: "strasse" })], {}, "de"), /category.*street.*Straße.*other.*strasse/);
});

test("reference integrity rejects unknown keys and every malformed direct membership", () => {
  assert.ok(paths, "The shared reference validator must be available");
  const category = definition({ hierarchical: true });
  const terms = graph([term("root"), term("child", { parent: "root" })], { hierarchical: true });
  const type = page({ taxonomies: ["category"] }).contentTypes[0];
  const entry = { collection: "page", id: "contact.md", data: { title: "Contact", status: "draft", taxonomies: { category: [{ collection: "category", id: "child" }] } } };
  const selected = new Map([[category.id, terms]]);
  assert.doesNotThrow(() => paths.validateReferences(type, [entry], selected));
  for (const [taxonomies, diagnostic] of [
    [{ category: [{ collection: "category", id: "missing" }] }, /page.*contact.md.*category.*missing/],
    [{ category: [{ collection: "tag", id: "child" }] }, /page.*contact.md.*category.*collection/],
    [{ category: [{ collection: "category", id: "child" }, { collection: "category", id: "child" }] }, /page.*contact.md.*category.*duplicate.*child/],
    [{ category: ["child"] }, /page.*contact.md.*category.*native reference/],
    [{ tag: [] }, /page.*contact.md.*unbound.*tag/],
  ]) assert.throws(() => paths.validateReferences(type, [{ ...entry, data: { ...entry.data, taxonomies } }], selected), diagnostic);
});

test("direct and descendant projections produce owned mixed items and deduplicate by type and entry", () => {
  assert.ok(paths, "The shared taxonomy projection must be available");
  const taxonomy = definition({ hierarchical: true });
  const terms = graph([term("root"), term("child", { parent: "root" })], { hierarchical: true });
  const shared = { category: [{ collection: "category", id: "root" }, { collection: "category", id: "child" }] };
  const entry = (type, id, refs, status = "publish") => ({ collection: type, id, data: { title: `${type}:${id}`, status, published_at: new Date("2026-09-20T12:00:00Z"), taxonomies: { category: refs } } });
  const sources = [
    { type: { id: "post", collection: "post", sourceKind: "markdown" }, entries: [entry("post", "same.md", shared.category), entry("post", "child.md", shared.category.slice(1)), entry("post", "draft.md", shared.category, "draft")] },
    { type: { id: "page", collection: "page", sourceKind: "markdown" }, entries: [entry("page", "same.md", shared.category)] },
  ];
  const href = (type, record) => `/${type}/${record.id.replace(/\.md$/, "")}`;
  const direct = paths.termItems(taxonomy, terms, "root", sources, { getEntryHref: href });
  const descendants = paths.termItems(taxonomy, terms, "root", sources, { include: "descendants", getEntryHref: href });
  assert.deepEqual(direct.map(item => item.id), ["page:same.md", "post:same.md"]);
  assert.deepEqual(descendants.map(item => item.id), ["page:same.md", "post:child.md", "post:same.md"]);
  assert.equal(direct[0].date.toISOString(), "2026-09-20T12:00:00.000Z");
  assert.notEqual(direct[0].date, sources[1].entries[0].data.published_at);
  assert.deepEqual(direct[0].entryContext, { type: "page", id: "same.md", source: "markdown", taxonomies: { category: ["child", "root"] } });
  assert.deepEqual(getEntryClasses(direct[0].entryContext), ["page", "page-same", "category-child", "category-root"]);
  assert.ok(Object.isFrozen(direct));
  assert.ok(Object.isFrozen(direct[0].entryContext.taxonomies.category));
  assert.equal(sources[1].entries[0].data.taxonomies.category[0].id, "root");
  assert.throws(() => paths.termItems(definition(), graph([term("root")]), "root", [], { include: "descendants", getEntryHref: href }), /descendants.*hierarchical/);
  assert.throws(() => paths.termItems(taxonomy, terms, "missing", [], { getEntryHref: href }), /category.*missing.*unknown term/);
});

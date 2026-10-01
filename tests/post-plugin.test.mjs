import assert from "node:assert/strict";
import test from "node:test";
import { z } from "astro/zod";

import { getEntryClasses } from "../src/config/index.js";
import { post } from "../src/plugins/post/index.js";
import { postSchema } from "../src/plugins/post/content.js";
import { postHrefFromEntry, postLoopItems, postPathsFromEntries, publishedPostsFromEntries } from "../src/plugins/post/paths.js";

function entry(id, data = {}) {
  return { id, collection: "post", data: postSchema.parse({
    title: "Announcement", status: "publish", published_at: "2026-09-28T12:00:00Z", ...data,
  }) };
}

test("Post label and mount preserve the canonical type and independent route owners", () => {
  const plugin = post({ label: "News", basePath: "/news", routes: { single: "host" } });
  assert.equal(plugin.id, "post");
  assert.equal(plugin.label, "News");
  assert.equal(plugin.basePath, "/news");
  assert.deepEqual(plugin.navigation, [{ label: "News", path: "/news", match: "prefix" }]);
  assert.deepEqual(plugin.contentTypes.map(type => [type.id, type.collection, type.singleRoute, type.source.kind]), [
    ["post", "post", "single", "markdown"],
  ]);
  assert.deepEqual(plugin.routes.map(route => [route.id, route.pattern, route.owner, route.prerender]), [
    ["archive", "/", "plugin", true], ["single", "/[...slug]", "host", true],
  ]);
  assert.equal(Object.hasOwn(plugin.routes[1], "entrypoint"), false);
  assert.equal(plugin.routes[0].entrypoint.endsWith("/post/routes/index.astro"), true);
  const source = new URL("file:///site/content/news/");
  const formats = ["md", "mdx"];
  const selected = post({ source, formats, taxonomies: ["category"] });
  source.pathname = "/changed/";
  formats.push("other");
  assert.equal(selected.contentTypes[0].source.base, "file:///site/content/news/");
  assert.deepEqual(selected.contentTypes[0].source.formats, ["md", "mdx"]);
  assert.ok(Object.isFrozen(selected.contentTypes[0].taxonomies));
});

test("Post factory rejects unknown options and noncanonical mounts by field", () => {
  for (const basePath of ["/", "/News", "/ä", "/news?x=1", "/_astro"]) {
    assert.throws(() => post({ basePath }), /basePath|namespace|canonical/i, basePath);
  }
  assert.throws(() => post({ routes: { archive: "missing" } }), /archive|owner/i);
  assert.throws(() => post({ routes: { details: "host" } }), /details|unsupported/i);
  assert.throws(() => post({ template: "Single.astro" }), /template|unsupported/i);
  assert.equal(post({ basePath: "/news/" }).basePath, "/news");
  assert.equal(postHrefFromEntry(entry("announcement.md"), { basePath: "/news/" }), "/news/announcement");
});

test("published Posts require an authored timezone timestamp without inventing optional dates", () => {
  const parsed = postSchema.parse({ title: " Announcement ", status: "publish", published_at: "2026-09-28T18:25:03+02:00" });
  assert.equal(parsed.title, "Announcement");
  assert.equal(parsed.published_at.toISOString(), "2026-09-28T16:25:03.000Z");
  assert.equal(Object.hasOwn(parsed, "created_at"), false);
  assert.equal(Object.hasOwn(parsed, "updated_at"), false);
  for (const value of [undefined, "2026-09-28", "2026-02-30T12:00:00Z", "2026-09-28T12:00:00", new Date(), 20260928]) {
    assert.throws(() => postSchema.parse({ title: "A", status: "publish", published_at: value }), /published_at|date|timestamp/i);
  }
  assert.throws(() => postSchema.parse({ title: "A", status: "publish", published_at: "2999-01-01T00:00:00Z" }), /published_at|future/i);
  assert.throws(() => postSchema.parse({ title: "A", status: "draft", tags: ["astro"] }), /tags|unrecognized/i);
  assert.throws(() => postSchema.parse({ title: " ", status: "draft" }), /title|small/i);
  assert.throws(() => postSchema.parse({ title: "A" }), /status/i);
  const bound = postSchema.extend({ taxonomies: z.strictObject({ category: z.array(z.string()) }) });
  assert.deepEqual(bound.parse({ title: "A", status: "draft", taxonomies: { category: ["company"] } }).taxonomies, { category: ["company"] });
});

test("invalid authored Post datetimes return field diagnostics instead of throwing from the publication check", () => {
  for (const published_at of ["2026-02-30T12:00:00Z", "2026-09-28T12:00:00"]) {
    const result = postSchema.safeParse({ title: "Announcement", status: "publish", published_at });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some(issue => issue.path.join(".") === "published_at" && issue.message.includes("valid ISO")));
  }
});

test("publication selection is explicit and stable by timestamp then exact source ID", () => {
  const entries = [entry("z.md"), entry("older.md", { published_at: "2026-09-27T12:00:00Z" }),
    entry("a.md"), entry("draft.md", { status: "draft", published_at: undefined }),
    entry("pending.md", { status: "pending", published_at: undefined }),
    entry("scheduled.md", { status: "future", published_at: "2000-01-01T12:00:00Z" })];
  const selected = publishedPostsFromEntries(entries);
  assert.deepEqual(selected.map(item => item.id), ["a.md", "z.md", "older.md"]);
  assert.equal(selected[0], entries[2]);
  assert.deepEqual(publishedPostsFromEntries([]), []);
  for (const item of entries.slice(3)) assert.throws(() => postHrefFromEntry(item), /publish/i);
  assert.deepEqual(postPathsFromEntries(entries).map(path => path.props.entry.id), ["a.md", "z.md", "older.md"]);
  assert.throws(() => publishedPostsFromEntries([{ ...entry("a.md"), collection: "page" }]), /collection/i);
});

test("Post URLs share one filename or explicit-slug mapping across language and host policies", () => {
  const street = entry("Straße.md");
  const apple = entry("Äpfel.md");
  assert.deepEqual(postPathsFromEntries([street, apple], { lang: "de", basePath: "/news" }).map(path => [path.params.slug, path.props.entry.id]),
                   [["strasse", "Straße.md"], ["aepfel", "Äpfel.md"]]);
  assert.equal(postHrefFromEntry(street, { lang: "de", basePath: "/news" }), "/news/strasse");
  const authored = entry("releases/update.md", { slug: "Şirket Çözümleri" });
  assert.equal(postHrefFromEntry(authored, { lang: "tr" }), "/posts/sirket-cozumleri");
  const [{ props }] = postPathsFromEntries([authored], { lang: "tr" });
  assert.equal(props.entry.id, "releases/update.md");
  for (const [trailingSlash, href] of [["always", "/docs/news/strasse/"], ["never", "/docs/news/strasse"], ["ignore", "/docs/news/strasse"]]) {
    const [item] = postLoopItems([street], { lang: "de", basePath: "/news", base: "/docs", trailingSlash });
    assert.equal(item.href, href);
    assert.equal(item.id, "Straße.md");
    assert.deepEqual(item.entryContext, { type: "post", id: "Straße.md", source: "markdown" });
    assert.equal(item.date.toISOString(), "2026-09-28T12:00:00.000Z");
  }
  assert.deepEqual(getEntryClasses(postLoopItems([street], { lang: "de" })[0].entryContext),
                   getEntryClasses(postLoopItems([street], { lang: "de", basePath: "/news" })[0].entryContext));
  assert.equal(postHrefFromEntry({ ...street, data: { ...street.data, title: "Changed title" } }, { lang: "de" }), "/posts/strasse");
});

test("root index and conversion collisions fail with exact owners while nested paths remain distinct", () => {
  for (const item of [entry("Index.md"), entry("other.md", { slug: "INDEX" })]) {
    assert.throws(() => postPathsFromEntries([item]), /index|archive|reserved/i);
  }
  assert.equal(postHrefFromEntry(entry("guide/index.md")), "/posts/guide/index");
  assert.throws(() => postPathsFromEntries([entry("Straße.md"), entry("strasse.md")], { lang: "de" }),
                /Straße\.md.*strasse\.md.*\/posts\/strasse|strasse\.md.*Straße\.md.*\/posts\/strasse/);
  assert.throws(() => postPathsFromEntries([entry("future.md", { status: "future" }), entry("Future.md")]), /future\.md.*Future\.md|Future\.md.*future\.md/);
  assert.deepEqual(postPathsFromEntries([entry("Straße.md"), entry("strasse.md", { slug: "different" })], { lang: "de" }).map(path => path.params.slug),
                   ["strasse", "different"]);
  assert.throws(() => postPathsFromEntries([entry("unsafe.md", { slug: "../admin" })]), /unsafe|slug/i);
  assert.throws(() => postPathsFromEntries([entry("unsafe.md", { slug: "news?preview=1" })]), /unsafe|slug/i);
});

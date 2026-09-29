import assert from "node:assert/strict";
import test from "node:test";

import { pagePathsFromEntries } from "../src/plugins/page/paths.js";

function page(id, status = "publish", extra = {}) {
  return { id, collection: "page", data: { title: id, status, ...extra } };
}

test("Page URLs convert source stems without changing source identity", () => {
  const entries = [
    page("index.md"), page("İletişim.md"), page("Kılavuz/Kurulum.md"),
    page("guide/index.md"), page("about.md", "publish", { slug: "Bize Ulaşın" }),
  ];
  const paths = pagePathsFromEntries(entries, { lang: "tr" });
  assert.deepEqual(paths.map((path) => [path.params.slug, path.props.entry.id]), [
    ["kilavuz/kurulum", "Kılavuz/Kurulum.md"], ["bize-ulasin", "about.md"],
    ["guide", "guide/index.md"], [undefined, "index.md"], ["iletisim", "İletişim.md"],
  ]);
  assert.equal(paths[4].props.entry, entries[1]);
  assert.deepEqual(pagePathsFromEntries([page("Über uns.md")], { lang: "de-DE" }).map((path) => path.params.slug), ["ueber-uns"]);
});

test("Page path list emits publish only while reserving scheduled URLs", () => {
  const entries = [
    page("first.md", "publish", { navOrder: 2 }),
    page("second.md", "draft"),
    page("third.md", "pending"),
    page("fourth.md", "future", { published_at: new Date("2999-01-01T00:00:00Z") }),
    page("home.md", "publish", { navOrder: 1 }),
  ];
  assert.deepEqual(pagePathsFromEntries(entries).map((path) => path.props.entry.id), ["home.md", "first.md"]);
  assert.deepEqual(pagePathsFromEntries([]), []);
  assert.throws(() => pagePathsFromEntries([page("Future.md", "future"), page("future.md")]), /Future\.md.*future\.md.*\/future|future\.md.*Future\.md.*\/future/);
});

test("canonical collisions identify both exact source IDs and one URL", () => {
  assert.throws(() => pagePathsFromEntries([page("About.md"), page("about.md")]), /About\.md.*about\.md.*\/about|about\.md.*About\.md.*\/about/);
  assert.throws(() => pagePathsFromEntries([page("about.md"), page("about/index.md")]), /about\.md.*about\/index\.md.*\/about|about\/index\.md.*about\.md.*\/about/);
  assert.throws(() => pagePathsFromEntries([page("Çözüm.md"), page("Cozum.md")], { lang: "tr" }), /\/cozum/);
  assert.deepEqual(pagePathsFromEntries([page("about.md"), page("About.md", "publish", { slug: "company" })]).map((path) => path.params.slug), ["company", "about"]);
});

test("reserved roots are rejected before conversion and active mounts are segment-aware", () => {
  for (const id of ["_ASTRO.md", "404.md", "__moo_content_integrity/check.md", "_server_islands.md", "_actions.md"]) {
    assert.throws(() => pagePathsFromEntries([page(id)]), /reserved|namespace/i, id);
  }
  assert.throws(() => pagePathsFromEntries([page("Aktuelles/news.md")], { lang: "de", reservedPrefixes: ["/aktuelles"] }), /aktuelles|reserved/i);
  assert.deepEqual(pagePathsFromEntries([page("aktuelles-other.md")], { reservedPrefixes: ["/aktuelles"] }).map((path) => path.params.slug), ["aktuelles-other"]);
  assert.throws(() => pagePathsFromEntries([page("contact.md")], { reservedPrefixes: ["/Aktuelles"] }), /reservedPrefixes|canonical/i);
});

test("Page path helpers reject unsafe authored URL data rather than altering it", () => {
  assert.throws(() => pagePathsFromEntries([page("about.md", "publish", { slug: "../admin" })]), /slug|unsafe/i);
  assert.throws(() => pagePathsFromEntries([page("about.md", "publish", { slug: "about?preview=1" })]), /slug|unsafe/i);
  assert.throws(() => pagePathsFromEntries([page("about.md", "publish", { slug: "中文" })]), /ASCII|slug/i);
  assert.throws(() => pagePathsFromEntries([{ ...page("about.md"), collection: "post" }]), /collection/i);
});

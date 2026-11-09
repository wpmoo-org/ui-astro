import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTermLinks,
  remarkTermLinks,
} from "../packages/astro/src/markdown/term-links.js";

const root = new URL("file:///site/");
const text = (value) => ({ type: "text", value });
const paragraph = (...children) => ({ type: "paragraph", children });
const tree = (...children) => ({ type: "root", children });
const run = (input, links, path = "/site/src/content/news/a.md", value) => {
  remarkTermLinks({
    links: normalizeTermLinks(links, root),
    site: "https://kita.example",
  })(input, { path, value });
  return input;
};
const partner = {
  terms: ["Leibniz-Zentrum Allgemeine Sprachwissenschaft", "ZAS"],
  href: "/kooperationspartner/leibniz-zas/",
};

test("term links turn the first mention into a link and keep the rest as text", () => {
  const result = run(
    tree(paragraph(text("Mit dem ZAS forschen wir. Das ZAS berät uns."))),
    [partner],
  );
  assert.deepEqual(result.children[0].children, [
    text("Mit dem "),
    {
      type: "link",
      url: "/kooperationspartner/leibniz-zas/",
      children: [text("ZAS")],
    },
    text(" forschen wir. Das ZAS berät uns."),
  ]);
});

test("term links use the earliest of a link's terms and prefer the longer one at a tie", () => {
  const result = run(
    tree(
      paragraph(text("Das Leibniz-Zentrum Allgemeine Sprachwissenschaft (ZAS) hilft.")),
    ),
    [partner],
  );
  const link = result.children[0].children[1];
  assert.equal(link.type, "link");
  assert.equal(link.children[0].value, "Leibniz-Zentrum Allgemeine Sprachwissenschaft");
  assert.equal(result.children[0].children[2].value, " (ZAS) hilft.");
});

test("term links match whole words only", () => {
  const result = run(tree(paragraph(text("Die ZASTER-Gruppe und ZASx sind kein Partner."))), [partner]);
  assert.equal(result.children[0].children.length, 1);
});

test("term links skip headings, code, existing links and images", () => {
  const input = tree(
    { type: "heading", depth: 2, children: [text("ZAS")] },
    paragraph(
      { type: "link", url: "/x", children: [text("ZAS")] },
      { type: "inlineCode", value: "ZAS" },
      { type: "strong", children: [text("Partner ZAS")] },
    ),
  );
  const result = run(input, [partner]);
  assert.deepEqual(result.children[0].children, [text("ZAS")]);
  const strong = result.children[1].children[2];
  assert.equal(strong.children[1].type, "link");
});

test("term links never link a document to itself", () => {
  const input = tree(paragraph(text("Das ZAS stellt sich vor.")));
  run(input, [{ ...partner, source: "src/content/partners/leibniz-zas.md" }], "/site/src/content/partners/leibniz-zas.md");
  assert.equal(input.children[0].children.length, 1);
});

test("term links skip a target the document already links by hand", () => {
  const sentence = () => tree(paragraph(text("Mit dem ZAS forschen wir.")));
  const linked = (value) => {
    const input = sentence();
    run(input, [partner], undefined, value);
    return input.children[0].children.length > 1;
  };
  assert.equal(linked("Mit dem ZAS forschen wir."), true);
  for (const value of [
    "Mehr beim [Zentrum](/kooperationspartner/leibniz-zas/#team).",
    "Siehe [Partner][zas].\n\n[zas]: /kooperationspartner/leibniz-zas",
    "Siehe https://kita.example/kooperationspartner/leibniz-zas/.",
    'Siehe <a href="/kooperationspartner/leibniz-zas/?x=1">hier</a>.',
  ])
    assert.equal(linked(value), false, value);
  assert.equal(linked("Siehe https://kita.example.org/kooperationspartner/leibniz-zas/."), true);
  const input = tree(
    paragraph(text("Mit dem ZAS forschen wir.")),
    paragraph({ type: "link", url: "/kooperationspartner/leibniz-zas", children: [text("hier")] }),
  );
  run(input, [partner]);
  assert.deepEqual(input.children[0].children, [text("Mit dem ZAS forschen wir.")]);
});

test("term links apply an entry only to the documents its include globs match", () => {
  const scoped = { ...partner, include: ["src/content/**/de/**", "src/pages/*.md"] };
  const linked = (path) => {
    const input = tree(paragraph(text("Mit dem ZAS forschen wir.")));
    run(input, [scoped], path);
    return input.children[0].children.length > 1;
  };
  assert.equal(linked("/site/src/content/news/de/a.md"), true);
  assert.equal(linked("/site/src/content/de/a.md"), true);
  assert.equal(linked("/site/src/pages/about.md"), true);
  assert.equal(linked("/site/src/pages/de/about.md"), false);
  assert.equal(linked("/site/src/content/news/en/a.md"), false);
  assert.equal(linked("/elsewhere/src/content/news/de/a.md"), false);
  assert.equal(linked(undefined), false);
});

test("term link options reject unsafe or ambiguous input", () => {
  assert.deepEqual(normalizeTermLinks(undefined, root), []);
  for (const [value, pattern] of [
    [{}, /must be an array/],
    [[{ terms: [], href: "/a/" }], /at least one term/],
    [[{ terms: [" ZAS"], href: "/a/" }], /trimmed plain text/],
    [[{ terms: ["ZAS"], href: "javascript:alert(1)" }], /site path or an https address/],
    [[{ terms: ["ZAS"], href: "//evil.example/" }], /site path or an https address/],
    [[{ terms: ["ZAS"], href: "/a/", color: "red" }], /color is unsupported/],
    [[{ terms: ["ZAS"], href: "/a/" }, { terms: ["ZAS"], href: "/b/" }], /duplicate term/],
    [[{ terms: ["ZAS"], href: "/a/", include: [] }], /at least one glob/],
    [[{ terms: ["ZAS"], href: "/a/", include: "src/**" }], /at least one glob/],
    [[{ terms: ["ZAS"], href: "/a/", include: ["/src/**"] }], /root-relative glob/],
    [[{ terms: ["ZAS"], href: "/a/", include: ["src/../x/**"] }], /root-relative glob/],
    [[{ terms: ["ZAS"], href: "/a/", include: [""] }], /root-relative glob/],
  ])
    assert.throws(() => normalizeTermLinks(value, root), pattern);
  assert.equal(
    normalizeTermLinks([{ terms: ["ZAS"], href: "https://www.leibniz-zas.de/", source: new URL("file:///site/a.md") }], root)[0].source,
    "/site/a.md",
  );
  assert.throws(
    () => normalizeTermLinks([{ terms: ["ZAS"], href: "/a/", include: ["src/**"] }]),
    /needs the project root/,
  );
  assert.equal(
    normalizeTermLinks([{ terms: ["Ag+"], href: "/a/", include: ["src/(de)/[x].md"] }], root)[0]
      .include[0].test("src/(de)/[x].md"),
    true,
  );
});

test("term links run in Sätteri, once per document, and skip the target's own file", async () => {
  const { markdownToHtml } = await import("satteri");
  const { satteriTermLinks } = await import("../packages/astro/src/markdown/term-links.js");
  const links = normalizeTermLinks(
    [{ ...partner, source: "src/content/partners/leibniz-zas.md" }],
    root,
  );
  const plugin = satteriTermLinks(links);
  const source = "## Das ZAS\n\nMit dem ZAS forschen wir. Das ZAS berät, siehe [ZAS](https://example.org) und `ZAS`.";
  const html = (url) =>
    markdownToHtml(source, { mdastPlugins: [plugin], fileURL: new URL(url) }).html;
  const news = await html("file:///site/src/content/news/a.md");
  assert.equal(
    (news.match(/href="\/kooperationspartner\/leibniz-zas\/"/g) ?? []).length,
    1,
  );
  assert.match(news, /<h2[^>]*>Das ZAS<\/h2>/);
  assert.match(news, /Mit dem <a href="\/kooperationspartner\/leibniz-zas\/">ZAS<\/a> forschen/);
  const self = await html("file:///site/src/content/partners/leibniz-zas.md");
  assert.doesNotMatch(self, /kooperationspartner/);
  const handLinked = markdownToHtml(
    "Mit dem ZAS forschen wir, mehr beim [Zentrum](/kooperationspartner/leibniz-zas/).",
    { mdastPlugins: [plugin], fileURL: new URL("file:///site/src/content/news/b.md") },
  ).html;
  assert.equal((handLinked.match(/<a /g) ?? []).length, 1);
  assert.match(handLinked, /Mit dem ZAS forschen/);
  const scoped = satteriTermLinks(
    normalizeTermLinks([{ ...partner, include: ["src/content/**/de/**"] }], root),
  );
  const scopedHtml = (url) =>
    markdownToHtml("Mit dem ZAS forschen wir.", { mdastPlugins: [scoped], fileURL: new URL(url) }).html;
  assert.match(await scopedHtml("file:///site/src/content/news/de/a.md"), /<a href=/);
  assert.doesNotMatch(await scopedHtml("file:///site/src/content/news/en/a.md"), /<a href=/);
});

test("term links join the configured processor and replace an earlier copy", async () => {
  const { addTermLinks } = await import("../packages/astro/src/markdown/term-links.js");
  const links = normalizeTermLinks([partner], root);
  const satteri = { name: "satteri", options: { mdastPlugins: ["other"] } };
  addTermLinks(satteri, links);
  addTermLinks(satteri, links);
  assert.equal(satteri.options.mdastPlugins.length, 2);
  assert.equal(satteri.options.mdastPlugins[0], "other");
  const unified = { name: "unified", options: { remarkPlugins: [] } };
  addTermLinks(unified, links);
  addTermLinks(unified, links);
  assert.equal(unified.options.remarkPlugins.length, 1);
  assert.throws(() => addTermLinks({ name: "custom", options: {} }, links), /satteri or unified/);
});

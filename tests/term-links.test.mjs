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
const run = (input, links, path = "/site/src/content/news/a.md") => {
  remarkTermLinks({ links: normalizeTermLinks(links, root) })(input, { path });
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
  ])
    assert.throws(() => normalizeTermLinks(value, root), pattern);
  assert.equal(
    normalizeTermLinks([{ terms: ["ZAS"], href: "https://www.leibniz-zas.de/", source: new URL("file:///site/a.md") }], root)[0].source,
    "/site/a.md",
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

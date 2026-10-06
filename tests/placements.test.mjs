import assert from "node:assert/strict";
import test from "node:test";

async function feature(path) {
  return import(path).catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return {};
    throw error;
  });
}
const options = await feature("../packages/astro/src/placements/options.js");
const matching = await feature("../packages/astro/src/placements/match.js");
const content = await feature("../packages/astro/src/placements/content.js");
const headings = await feature(
  "../packages/astro/src/blocks/table-of-contents/headings.js",
);
const normalize = (value) => {
  assert.equal(typeof options.normalizePlacements, "function");
  return options.normalizePlacements(value);
};
const context = {
  href: "/de/beitraege/beispiel",
  locale: "de",
  view: "single",
  type: "post",
  entry: {
    id: "de/example.md",
    translationKey: "example",
    taxonomies: { category: ["guides"], tag: ["astro"] },
  },
};

test("placements preserve stable order and require all included dimensions", () => {
  const profile = normalize({
    placements: [
      { id: "later", block: "toc", at: "aside.content", order: 20 },
      {
        id: "first",
        block: "toc",
        at: "aside.content",
        order: 5,
        include: {
          types: ["post"],
          locales: ["de"],
          terms: { category: ["guides"] },
        },
      },
      { id: "tie", block: "toc", at: "aside.content", order: 5 },
      {
        id: "excluded",
        block: "toc",
        at: "aside.content",
        exclude: { translationKeys: ["example"] },
      },
      {
        id: "not-page",
        block: "toc",
        at: "aside.content",
        include: { types: ["page"] },
      },
    ],
  });
  assert.deepEqual(
    matching.selectPlacements(profile, context).map((p) => p.id),
    ["first", "tie", "later"],
  );
  assert.ok(Object.isFrozen(profile.placements));
  assert.ok(Object.isFrozen(profile.placements[1].include.terms.category));
});

test("taxonomy conditions use current archive term and not listed entry membership", () => {
  normalize({});
  const rule = { terms: { category: ["guides"] } };
  assert.equal(
    matching.matchConditions(rule, {
      view: "taxonomy",
      taxonomy: { id: "category", term: "guides" },
    }),
    true,
  );
  assert.equal(
    matching.matchConditions(rule, {
      view: "taxonomy",
      taxonomy: { id: "category", term: "news" },
    }),
    false,
  );
  assert.equal(
    matching.matchConditions(
      { entries: ["de/example.md"] },
      { view: "archive" },
    ),
    false,
  );
  assert.equal(
    matching.matchConditions(
      { terms: { category: ["guides"], tag: ["other"] } },
      context,
    ),
    false,
  );
});

test("placement configuration rejects invalid identities, locations, arrays and props", () => {
  const valid = { id: "toc", block: "toc", at: "aside.content" };
  for (const invalid of [
    { ...valid, at: "header.typo" },
    { ...valid, block: "unknown" },
    { ...valid, order: Infinity },
    { ...valid, order: 1.5 },
    { ...valid, include: { types: [] } },
    { ...valid, include: { types: new Array(2) } },
    { ...valid, include: { roles: ["admin"] } },
    { ...valid, props: { callback: () => true } },
    { ...valid, props: { value: undefined } },
    { ...valid, mode: "replace" },
    { ...valid, unknown: true },
  ])
    assert.throws(
      () => normalize({ placements: [invalid] }),
      /placement|prop|support|array|JSON|order|mode/i,
    );
  assert.throws(() => normalize({ placements: [valid, valid] }), /duplicate/i);
  assert.throws(
    () =>
      normalize({ blocks: { toc: { component: new URL(import.meta.url) } } }),
    /reserved/i,
  );
  assert.throws(
    () =>
      normalize({
        blocks: {
          custom: { component: new URL("https://example.test/block.astro") },
        },
      }),
    /file/i,
  );
});

test("component and collection block descriptors normalize without importing Astro", () => {
  const file = new URL("../apps/demo/components/Hero.astro", import.meta.url);
  const profile = normalize({
    blocks: {
      hero: { component: file },
      contact: { collection: "block", translationKey: "contact" },
    },
    placements: [
      {
        id: "hero",
        block: "hero",
        at: "header.after",
        props: { title: "Example", enabled: true },
      },
    ],
  });
  assert.equal(profile.blocks.hero.kind, "component");
  assert.equal(profile.blocks.contact.translationKey, "contact");
  assert.equal(file.protocol, "file:");
});

test("only resolved replacement declarations can conflict", () => {
  assert.equal(typeof matching.validateResolvedPlacements, "function");
  const replacement = { id: "first", at: "entry.taxonomies", mode: "replace" };
  assert.doesNotThrow(() => matching.validateResolvedPlacements([replacement]));
  assert.throws(
    () =>
      matching.validateResolvedPlacements([
        replacement,
        { ...replacement, id: "second" },
      ]),
    /replacement.*first.*second/i,
  );
});

const entries = [
  {
    id: "en/help.md",
    data: { translationKey: "help", locale: "en", status: "publish" },
  },
  {
    id: "de/help.md",
    data: { translationKey: "help", locale: "de", status: "draft" },
  },
];
test("native block selection omits drafts and absent translations but rejects missing keys", () => {
  assert.equal(typeof content.selectContentBlock, "function");
  assert.equal(
    content.selectContentBlock(entries, "help", "en", true).id,
    "en/help.md",
  );
  assert.equal(
    content.selectContentBlock(entries, "help", "de", true),
    undefined,
  );
  assert.equal(
    content.selectContentBlock(entries, "help", "tr", true),
    undefined,
  );
  assert.throws(
    () => content.selectContentBlock(entries, "missing", "en", true),
    /missing/i,
  );
  assert.throws(
    () =>
      content.selectContentBlock([...entries, entries[0]], "help", "en", true),
    /duplicate/i,
  );
  assert.throws(
    () =>
      content.selectContentBlock(
        [
          {
            id: "help.md",
            data: { translationKey: "help", status: "publish" },
          },
        ],
        "help",
        "de",
        true,
      ),
    /locale/i,
  );
  assert.equal(
    content.selectContentBlock(
      [{ id: "help.md", data: { translationKey: "help", status: "publish" } }],
      "help",
      "de",
      false,
    ).id,
    "help.md",
  );
});

test("native block schema defaults to draft and excludes route/layout fields", () => {
  assert.ok(content.contentBlockSchema);
  assert.equal(
    content.contentBlockSchema.parse({ translationKey: "help" }).status,
    "draft",
  );
  assert.throws(() =>
    content.contentBlockSchema.parse({ translationKey: "help", slug: "help" }),
  );
  assert.throws(() =>
    content.contentBlockSchema.parse({
      translationKey: "help",
      status: "future",
    }),
  );
});

test("TOC uses native heading identity and ordered configurable depths", () => {
  assert.equal(typeof headings.filterHeadings, "function");
  const source = [
    { depth: 1, slug: "title", text: "Title" },
    { depth: 2, slug: "intro", text: "<Intro>" },
    { depth: 4, slug: "detail", text: "Detail" },
  ];
  assert.deepEqual(
    headings.filterHeadings(source).map((h) => h.slug),
    ["intro"],
  );
  assert.deepEqual(
    headings.filterHeadings(source, [1, 4]).map((h) => h.slug),
    ["title", "detail"],
  );
  assert.deepEqual(headings.filterHeadings([]), []);
  for (const levels of [[], [0], [7], [2.5], new Array(1)])
    assert.throws(
      () => headings.filterHeadings(source, levels),
      /depth|array/i,
    );
  assert.equal(source[1].text, "<Intro>");
});

test("ready block props reject invalid labels, unknown options and depths early", () => {
  for (const props of [
    { label: 42 },
    { depths: [] },
    { depths: [2, 7] },
    { typo: true },
  ])
    assert.throws(
      () =>
        normalize({
          placements: [{ id: "toc", block: "toc", at: "aside.content", props }],
        }),
      /props|depths/,
    );
});

test("native prose heading IDs and local links get distinct placement namespaces", async () => {
  const module =
    await import("../packages/astro/src/placements/heading-ids.js").catch(
      () => ({}),
    );
  assert.equal(typeof module.namespaceHeadingIds, "function");
  const html =
    '<h2 id="intro">Intro</h2><a href="#intro">Go</a><div id="widget">Widget</div><script>const id="intro";</script>';
  const headings = [{ depth: 2, slug: "intro", text: "Intro" }];
  assert.equal(
    module.namespaceHeadingIds(html, headings, "block-one"),
    '<h2 id="block-one-intro">Intro</h2><a href="#block-one-intro">Go</a><div id="widget">Widget</div><script>const id="intro";</script>',
  );
  assert.notEqual(
    module.namespaceHeadingIds(html, headings, "block-one"),
    module.namespaceHeadingIds(html, headings, "block-two"),
  );
});

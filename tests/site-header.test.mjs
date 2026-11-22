import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { extractNav, normalizeHtml, stripLineEnds } from "./helpers/site-header-normalize.mjs";
import { brandCases, examples } from "./helpers/site-header-cases.mjs";
import { layoutCases } from "./helpers/layout-cases.mjs";
import { createRenderer } from "./helpers/render-astro.mjs";

const fixtureDir = fileURLToPath(new URL("./fixtures/site-header-core/", import.meta.url));
const defaultDir = fileURLToPath(new URL("./fixtures/layout-default/", import.meta.url));

// Core catalog example inputs and macro-only brand cases, shared with
// scripts/sync_site_header_core.mjs, which rendered the fixtures from Core.
// Fixtures have trailing whitespace stripped per line, so the SDK output is
// compared after the same strip (stripLineEnds).
let renderer;
before(async () => { renderer = await createRenderer(undefined, { stubIntegration: true }); });
after(async () => { await renderer?.close(); });

const header = (props, slots) => renderer.render("blocks/site-header/SiteHeader.astro", { props, slots });
const minimal = { id: "h", ariaLabel: "Main", brand: { label: "Brand" } };

for (const [name, { props, action }] of Object.entries(examples)) {
  test(`site header matches Core render: ${name}`, async () => {
    const expected = await readFile(`${fixtureDir}${name}.html`, "utf8");
    const html = await header(props, { default: action });
    const nav = extractNav(html);
    assert.equal(html.trim(), nav, "the block renders only the <nav>");
    assert.equal(stripLineEnds(normalizeHtml(nav)), expected);
  });
}

for (const [name, props] of Object.entries(brandCases)) {
  test(`site header brand matches Core macro render: ${name}`, async () => {
    const expected = await readFile(`${fixtureDir}${name}.html`, "utf8");
    assert.equal(stripLineEnds(normalizeHtml(extractNav(await header(props)))), expected);
  });
}

test("site header records the Core source commit", async () => {
  const source = JSON.parse(await readFile(`${fixtureDir}source.json`, "utf8"));
  assert.match(source.commit, /^[0-9a-f]{7,40}$/u);
  assert.deepEqual(source.previews, Object.keys(examples));
  assert.deepEqual(source.cases, Object.keys(brandCases));
});

test("site header trims the brand content like Core", async () => {
  const text = normalizeHtml(await header({ ...minimal, brand: { label: " Acme\x85" } }));
  assert.equal(text.match(/<a class="navbar-brand[^"]*" href="\/">\nAcme\n<\/a>/gu)?.length, 2);
  // Lockups start and end with tags, so their label keeps its spaces, as in Core.
  const lockup = normalizeHtml(await header({ ...minimal, brand: { label: " Acme ", mark: "blocks" } }));
  assert.equal(lockup.match(/<span>\n Acme \n<\/span>/gu)?.length, 2);
  const subtitle = normalizeHtml(await header({ ...minimal, brand: { label: " Acme ", subtitle: "S" } }));
  assert.equal(subtitle.match(/<span>\n Acme \n<\/span>/gu)?.length, 2);
});

test("site header lockup dir sits on the inner span only", async () => {
  const html = normalizeHtml(await header({ ...minimal, brand: { label: "B", mark: "blocks", dir: "rtl" } }));
  assert.equal(html.match(/<span class="d-inline-flex align-items-center gap-2" dir="rtl">/gu)?.length, 2);
  assert.doesNotMatch(html, /<a [^>]*dir=/u);
  const plain = normalizeHtml(await header({ ...minimal, brand: { label: "B", mark: "blocks" } }));
  assert.doesNotMatch(plain, /dir=/u);
  assert.doesNotMatch(plain, /ms-auto/u);
});

test("normalizer keeps text-boundary whitespace and rejects extra navs", () => {
  assert.notEqual(normalizeHtml("<span>a</span>"), normalizeHtml("<span> a </span>"));
  assert.equal(normalizeHtml("<p>\n  a\n  b </p>"), "<p>\n a b \n</p>\n");
  assert.throws(() => extractNav("<nav>a</nav><nav>b</nav>"), /exactly one/u);
  assert.throws(() => extractNav("<div></div>"), /exactly one/u);
});

test("site header validation uses Core's messages", async () => {
  const cases = [
    [{ ...minimal, id: "" }, /Site header id is required/u],
    [{ ...minimal, id: "a b" }, /Site header id is required/u],
    [{ ...minimal, id: "a\x1fb" }, /Site header id is required/u],
    [{ ...minimal, id: "\x85" }, /Site header id is required/u],
    [{ ...minimal, ariaLabel: " " }, /Site header aria_label is required/u],
    [{ ...minimal, ariaLabel: "\x1c" }, /Site header aria_label is required/u],
    [{ ...minimal, brand: { label: "" } }, /Site header brand label is required/u],
    [{ ...minimal, brand: { label: "B", logo: { alt: "x" } } }, /Site header logo requires src/u],
    [{ ...minimal, brand: { label: "B", mark: "blocks", dir: "up" } }, /Unknown site header brand dir: up/u],
    [{ ...minimal, brand: { label: "B", mark: "blocks", dir: "LTR" } }, /Unknown site header brand dir: LTR/u],
    [{ ...minimal, brand: { label: "B", dir: "up" } }, /Unknown site header brand dir: up/u],
    [{ ...minimal, brand: { label: "B", mark: "blocks", logo: { src: "/l.svg" } } }, /Site header brand mark and logo are mutually exclusive/u],
    [{ ...minimal, brand: { label: "B", subtitle: "S", logo: { src: "/l.svg" } } }, /Site header brand subtitle requires a visible label/u],
    [{ ...minimal, brand: { label: "", mark: "blocks" } }, /Site header brand label is required/u],
    [{ ...minimal, brand: { label: 0 } }, /Site header brand label is required/u],
    [{ ...minimal, brand: { label: false } }, /Site header brand label is required/u],
    [{ ...minimal, brand: { label: null } }, /Site header brand label is required/u],
    [{ ...minimal, items: [{ label: 0 }] }, /Site header item label is required/u],
    [{ ...minimal, utilityItems: [{ label: false }] }, /Site header item label is required/u],
    [{ ...minimal, brand: { label: "B", mark: "nope" } }, /Unknown Lucide icon: nope/u],
    [{ ...minimal, breakpoint: "md" }, /Unknown site header breakpoint: md/u],
    [{ ...minimal, surface: "light" }, /Unknown site header surface: light/u],
    [{ ...minimal, brand: { label: "B", href: "javascript:alert(1)" } }, /Site header href scheme is not allowed: javascript/u],
    [{ ...minimal, items: [{ label: "A", href: "data:text/html,x" }] }, /scheme is not allowed: data/u],
    [{ ...minimal, items: [{ label: "A", children: [{ label: "B", href: "vbscript:x" }] }] }, /scheme is not allowed: vbscript/u],
    [{ ...minimal, items: [{ label: "A", href: "java\tscript:x" }] }, /Site header href contains a control character/u],
    [{ ...minimal, items: [{ label: " " }] }, /Site header item label is required/u],
    [{ ...minimal, items: [{ label: "A", children: [{ label: " " }] }] }, /Dropdown item label is required/u],
    [{ ...minimal, closeLabel: " " }, /Close button aria_label is required/u],
    [{ ...minimal, menuLabel: " " }, /Button without a visible label requires aria_label/u],
  ];
  for (const [props, message] of cases) {
    await assert.rejects(() => header(props), message, JSON.stringify(props));
  }
  for (const href of ["/path", "?q=1", "#x", "https://a.example/", "mailto:a@b.c", "tel:+491", "HTTP://a.example"]) {
    await header({ ...minimal, brand: { label: "B", href } });
  }
});

test("site header validation order follows Core's macro", async () => {
  const bad = "javascript:x";
  // Brand href before close label; close label before items; items before menu label.
  await assert.rejects(() => header({ ...minimal, brand: { label: "B", href: bad }, closeLabel: " " }), /scheme is not allowed/u);
  await assert.rejects(() => header({ ...minimal, closeLabel: " ", items: [{ label: "A", href: bad }] }), /Close button aria_label/u);
  await assert.rejects(() => header({ ...minimal, menuLabel: " ", items: [{ label: "A", href: bad }] }), /scheme is not allowed/u);
  await assert.rejects(() => header({ ...minimal, menuLabel: " ", utilityItems: [{ label: " " }] }), /Site header item label is required/u);
  // Logo src, brand dir, mark and logo, subtitle, then breakpoint.
  await assert.rejects(() => header({ ...minimal, brand: { label: "B", logo: { alt: "x" }, dir: "up" } }), /logo requires src/u);
  await assert.rejects(() => header({ ...minimal, brand: { label: "B", mark: "blocks", logo: { src: "/l" }, dir: "up" } }), /brand dir: up/u);
  await assert.rejects(() => header({ ...minimal, brand: { label: "B", mark: "blocks", subtitle: "S", logo: { src: "/l" } } }), /mutually exclusive/u);
  await assert.rejects(() => header({ ...minimal, brand: { label: "B", subtitle: "S", logo: { src: "/l" } }, breakpoint: "md" }), /requires a visible label/u);
  // Unknown mark after the brand href, before the close label.
  await assert.rejects(() => header({ ...minimal, brand: { label: "B", href: bad, mark: "nope" } }), /scheme is not allowed/u);
  await assert.rejects(() => header({ ...minimal, brand: { label: "B", mark: "nope" }, closeLabel: " " }), /Unknown Lucide icon: nope/u);
});

test("Layout header-region renders a bare header around the slot", async () => {
  const html = await renderer.render("layouts/Layout.astro", {
    props: { title: "T", shellMode: "document" },
    slots: { default: "<p>body</p>", "header-region": '<nav id="x">N</nav>' },
  });
  assert.match(normalizeHtml(html), /<header>\n<nav id="x">\nN\n<\/nav>\n<\/header>\n<main/u);
});

test("Layout header-region does not combine with sidebar, header or overlay", async () => {
  const region = '<nav>N</nav>';
  await assert.rejects(() => renderer.render("layouts/Layout.astro", { props: { title: "T" }, slots: { default: "x", header: "h", "header-region": region } }), /Layout header-region does not combine with sidebar, header slot or headerOverlay/u);
  await assert.rejects(() => renderer.render("layouts/Layout.astro", { props: { title: "T", shellMode: "document", headerOverlay: true }, slots: { default: "x", "header-region": region } }), /Layout header-region does not combine with sidebar, header slot or headerOverlay/u);
  await assert.rejects(() => renderer.render("layouts/Layout.astro", { props: { title: "T", sidebar: true, sidebarId: "s", sidebarKey: "k" }, slots: { default: "x", sidebar: "<aside></aside>", "header-region": region } }), /Layout header-region does not combine with sidebar, header slot or headerOverlay/u);
});

test("Layout header-region keeps the compact TOC host", async () => {
  const html = await renderer.render("layouts/Layout.astro", {
    props: { title: "T", shellMode: "document", headerTocClass: "d-none" },
    slots: { default: "x", "header-region": "<nav>N</nav>", "header-toc": "<nav>toc</nav>" },
  });
  const normal = normalizeHtml(html);
  assert.match(normal, /<header>\n<nav>\nN\n<\/nav>\n<div class="[^"]*d-none[^"]*" data-header-reading-host="">\n/u);
  assert.match(normal, /data-header-reading-bar[\s\S]*<nav>\ntoc\n<\/nav>/u);
});

for (const name of Object.keys(layoutCases)) {
  test(`Layout without the new slots is unchanged from the recorded snapshot: ${name}`, async () => {
    const expected = await readFile(`${defaultDir}${name}.html`, "utf8");
    assert.equal(stripLineEnds(normalizeHtml(await renderer.render("layouts/Layout.astro", layoutCases[name]))), expected);
  });
}

test("Layout default snapshot records its source commit", async () => {
  const source = JSON.parse(await readFile(`${defaultDir}source.json`, "utf8"));
  assert.equal(source.commit, "4c4e1d0");
});

test("Layout without header-region renders no bare header", async () => {
  const html = await renderer.render("layouts/Layout.astro", {
    props: { title: "T" },
    slots: { default: "x", header: "h" },
  });
  const normal = normalizeHtml(html);
  assert.doesNotMatch(normal, /<header>\n/u);
  assert.match(normal, /<header class="position-relative z-3/u);
});

for (const mode of [undefined, "drawer", "header"]) {
  test(`SiteLayout site-header rejects a sidebar option (${mode ?? "app"})`, async () => {
    await assert.rejects(
      () => renderer.render("layouts/SiteLayout.astro", {
        props: { title: "T", href: "/", options: { sidebar: { id: "s", key: "k", ...(mode ? { mode } : {}) } } },
        slots: { default: "x", "site-header": "<nav></nav>" },
      }),
      /SiteLayout site-header slot does not combine with a sidebar or navigation drawer/u,
    );
  });
}

test("Icon menu renders Core's path", async () => {
  const html = await renderer.render("components/internal/Icon.astro", { props: { name: "menu" } });
  assert.match(html, /data-lucide="menu"/u);
  assert.match(html, /d="M4 5h16M4 12h16M4 19h16"/u);
});

test("Icon group wraps brand icons in Core's <g> only on request", async () => {
  const plain = await renderer.render("components/internal/Icon.astro", { props: { name: "blocks" } });
  assert.doesNotMatch(plain, /<g[\s>]/u);
  assert.doesNotMatch(plain, /group=/u);
  const grouped = await renderer.render("components/internal/Icon.astro", { props: { name: "blocks", group: true } });
  assert.match(grouped, /<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10 22V7/u);
  assert.doesNotMatch(grouped, /group=/u);
});

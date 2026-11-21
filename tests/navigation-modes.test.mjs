import assert from "node:assert/strict";
import test from "node:test";
import {
  defineSite,
  resolveParts,
  resolvePageOptions,
} from "../packages/astro/src/config/index.js";

test("legacy app sidebar keeps its exact resolved contract", () => {
  assert.deepEqual(defineSite({ defaults: { sidebar: {} } }).defaults.sidebar, {
    side: "left",
    variant: "sidebar",
    collapsible: "icon",
    rail: true,
    defaultOpen: true,
  });
});
test("drawer defaults are distinct from app sidebar preferences", () => {
  const site = defineSite({ defaults: { sidebar: { mode: "drawer" } } });
  assert.deepEqual(site.defaults.sidebar, { mode: "drawer", side: "left" });
  assert.equal(Object.isFrozen(site.defaults.sidebar), true);
});
test("header navigation has its own responsive defaults and layered overrides", () => {
  const site = defineSite({
    defaults: { sidebar: { mode: "header" } },
    types: { page: { sidebar: { side: "right" } } },
  });
  assert.deepEqual(site.defaults.sidebar, { mode: "header", side: "left", breakpoint: "xl" });
  assert.deepEqual(resolvePageOptions(site, "page", "single").sidebar, {
    mode: "header", side: "right", breakpoint: "xl",
  });
  assert.deepEqual(resolvePageOptions(site, "page", "single", {
    sidebar: { mode: "header", breakpoint: "lg" },
  }).sidebar, { mode: "header", side: "right", breakpoint: "lg" });
  assert.deepEqual(resolvePageOptions(site, "page", "single", {
    sidebar: { mode: "drawer" },
  }).sidebar, { mode: "drawer", side: "left" });
  assert.equal(resolvePageOptions(site, "page", "single", { sidebar: null }).sidebar, null);
});
test("header mode rejects app fields and other modes reject its breakpoint", () => {
  for (const sidebar of [
    { mode: "header", rail: true },
    { mode: "header", variant: "inset" },
    { mode: "header", breakpoint: "sm" },
    { mode: "drawer", breakpoint: "lg" },
    { mode: "sidebar", breakpoint: "xl" },
  ]) assert.throws(() => defineSite({ defaults: { sidebar } }), /sidebar|header|breakpoint/);
  const site = defineSite({ defaults: { sidebar: { mode: "drawer" } } });
  assert.throws(() => resolvePageOptions(site, "page", "single", {
    sidebar: { breakpoint: "xl" },
  }), /drawer|breakpoint/);
});
test("mode changes reset incompatible inherited settings and side-only updates inherit mode", () => {
  const site = defineSite({
    defaults: { sidebar: { side: "right", variant: "inset", rail: false } },
    types: { page: { sidebar: { mode: "drawer" } } },
  });
  assert.deepEqual(resolvePageOptions(site, "page", "single").sidebar, {
    mode: "drawer",
    side: "left",
  });
  assert.deepEqual(
    resolvePageOptions(site, "page", "single", { sidebar: { side: "right" } })
      .sidebar,
    { mode: "drawer", side: "right" },
  );
  assert.deepEqual(
    resolvePageOptions(site, "page", "single", { sidebar: { mode: "sidebar" } })
      .sidebar,
    {
      mode: "sidebar",
      side: "left",
      variant: "sidebar",
      collapsible: "icon",
      rail: true,
      defaultOpen: true,
    },
  );
  assert.equal(
    resolvePageOptions(site, "page", "single", { sidebar: null }).sidebar,
    null,
  );
});
test("drawer rejects explicit app fields including later inherited overrides", () => {
  for (const field of [
    { rail: true },
    { variant: "inset" },
    { defaultOpen: true },
    { collapsible: "offcanvas" },
  ]) {
    assert.throws(
      () => defineSite({ defaults: { sidebar: { mode: "drawer", ...field } } }),
      /drawer|sidebar/,
    );
    const site = defineSite({ defaults: { sidebar: { mode: "drawer" } } });
    assert.throws(
      () => resolvePageOptions(site, "page", "single", { sidebar: field }),
      /drawer/,
    );
  }
});
test("document shell mode accepts header and drawer navigation but not an app sidebar", () => {
  for (const sidebar of [null, { mode: "header" }, { mode: "drawer" }]) {
    const site = defineSite({ defaults: { shellMode: "document", sidebar } });
    assert.equal(resolvePageOptions(site, "page", "single").shellMode, "document");
  }
  assert.throws(() => defineSite({ defaults: { shellMode: "document", sidebar: {} } }), /shellMode document/);
  const site = defineSite({ defaults: { shellMode: "document", sidebar: { mode: "header" } } });
  assert.throws(() => resolvePageOptions(site, "page", "single", { sidebar: { mode: "sidebar" } }), /shellMode document/);
  assert.throws(() => defineSite({ defaults: { shellMode: "page" } }), /shellMode/);
});
test("header overlay is a document-mode page option", () => {
  const site = defineSite({ defaults: { shellMode: "document", sidebar: { mode: "header" } } });
  assert.equal(resolvePageOptions(site, "page", "single").headerOverlay, false);
  assert.equal(resolvePageOptions(site, "page", "single", { headerOverlay: true }).headerOverlay, true);
  assert.throws(() => defineSite({ defaults: { headerOverlay: true } }), /headerOverlay requires shellMode document/);
});
test("footer width follows the page width unless a theme selects another", () => {
  assert.equal(defineSite().defaults.footerWidth, null);
  const site = defineSite({ defaults: { footerWidth: "fluid" } });
  assert.equal(resolvePageOptions(site, "page", "single").footerWidth, "fluid");
  assert.equal(resolvePageOptions(site, "page", "single", { footerWidth: null }).footerWidth, null);
  assert.throws(() => defineSite({ defaults: { footerWidth: "wide" } }), /footerWidth/);
});

test("site logo and header surface are validated and resolved", () => {
  const site = defineSite({ logo: { src: { src: "/_astro/logo.svg", width: 1, height: 1, format: "svg" }, inverseSrc: "/logo-inverse.svg", alt: "Example", width: 120, height: 32 } });
  assert.deepEqual(site.logo, { src: "/_astro/logo.svg", alt: "Example", width: 120, height: 32, inverseSrc: "/logo-inverse.svg" });
  assert.equal(defineSite({}).logo, undefined);
  assert.equal(defineSite({ logo: { src: "/l.svg", alt: "", width: 1, height: 1, brandText: true } }).logo.brandText, true);
  for (const bad of [
    { src: "/l.svg", alt: "", width: 1, height: 1 },
    { src: "/l.svg", alt: "A\nB", width: 1, height: 1 },
    { src: "/l.svg", alt: "A", width: 0, height: 1 },
    { src: "/l.svg", alt: "A", width: 1.5, height: 1 },
    { src: "/l.svg", alt: "A", width: 1 },
    { src: "/l.svg", alt: "A", width: 1, height: 1, extra: true },
  ]) assert.throws(() => defineSite({ logo: bad }), /logo/, JSON.stringify(bad));
  assert.equal(Object.hasOwn(resolveParts().header, "surface"), false);
  assert.equal(resolveParts({ header: { surface: "dark" } }).header.surface, "dark");
  assert.throws(() => resolveParts({ header: { surface: "blue" } }), /surface/);
});

test("header projection places utility and drawer items without changing the drawer", async () => {
  const { buildSiteNavigation, projectHeaderNavigation } = await import("../packages/astro/src/site/chrome.js");
  const { resolveSitePresentation } = await import("../packages/astro/src/site/presentation.js");
  const presentation = resolveSitePresentation(defineSite({ presentation: { navigation: "grouped" } }), "en");
  const links = [
    { label: "About", href: "/about", active: false },
    { label: "Jobs", href: "/jobs", active: false, placement: "utility" },
    { label: "Legal", href: "/legal", active: false, placement: "drawer" },
    { label: "Team", href: "/team", active: false },
  ];
  const navigation = buildSiteNavigation({
    context: { plugins: [{ id: "page", label: "Pages", basePath: "/" }] },
    links, taxonomyGroups: [], locale: "en", href: "/", presentation, localHref: (path) => path,
  });
  const children = navigation[0].items[0].children;
  assert.deepEqual(children.map((child) => child.placement), [undefined, "utility", "drawer", undefined]);
  const result = projectHeaderNavigation({
    navigation, taxonomyGroups: [], presentation, homeHref: "/", homeNavigation: null,
  });
  assert.deepEqual(result.siteItems.flatMap((item) => item.children.map((child) => child.title)), ["About", "Team"]);
  assert.deepEqual(result.utilityItems.map((item) => item.title), ["Jobs"]);
  assert.deepEqual(result.groups[0].items[0].children.map((child) => child.title), ["About", "Jobs", "Legal", "Team"]);
  const plain = buildSiteNavigation({
    context: { plugins: [{ id: "page", label: "Pages", basePath: "/" }] },
    links: links.map(({ placement, ...link }) => link), taxonomyGroups: [], locale: "en", href: "/", presentation, localHref: (path) => path,
  });
  assert.equal(JSON.stringify(plain).includes("placement"), false);
  const flat = buildSiteNavigation({
    context: { plugins: [] }, links: [links[1]], taxonomyGroups: [], locale: "en", href: "/",
    presentation: { ...presentation, navigation: "flat" }, localHref: (path) => path,
  });
  assert.equal(flat[0].items[0].placement, "utility");
});

test("Navigation markup contract is additive in source", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../packages/astro/src/components/Navigation.astro", import.meta.url), "utf8");
  assert.match(source, /"data-slot": "navigation-rows"/u);
  assert.match(source, /data-slot="navigation-utility"/u);
  assert.match(source, /navigation-brand-logo/u);
  assert.match(source, /hasUtility = style === "navbar"/u);
});

test("header projection honours placement on Home and on grouped parents", async () => {
  const { projectHeaderNavigation } = await import("../packages/astro/src/site/chrome.js");
  const { resolveSitePresentation } = await import("../packages/astro/src/site/presentation.js");
  const presentation = resolveSitePresentation(defineSite({ presentation: { navigation: "grouped" } }), "en");
  const base = (navigation, homeNavigation) => projectHeaderNavigation({
    navigation, taxonomyGroups: [], presentation, homeHref: "/", homeNavigation,
  });
  const group = (items) => [{ label: "Website", items }];
  const kid = (title, href) => ({ title, href, active: false });
  const util = base(group([{ title: "Docs", children: [kid("A", "/a")] }]), { href: "/", active: false, placement: "utility" });
  assert.deepEqual(util.utilityItems.map((item) => item.title), ["Home"]);
  assert.equal(util.siteItems.some((item) => item.title === "Home"), false);
  assert.equal(util.groups[0].items[0].title, "Home");
  const drawer = base(group([{ title: "Docs", children: [kid("A", "/a")] }]), { href: "/", active: false, placement: "drawer" });
  assert.equal(drawer.siteItems.some((item) => item.title === "Home"), false);
  assert.equal(drawer.utilityItems.length, 0);
  const parents = base(group([
    { title: "Hidden", placement: "drawer", children: [kid("H1", "/h1"), { ...kid("H2", "/h2"), placement: "utility" }] },
    { title: "Moved", href: "/moved", placement: "utility" },
    { title: "Kept", children: [kid("K", "/k")] },
  ]), null);
  assert.deepEqual(parents.siteItems.map((item) => item.title), ["Kept"]);
  assert.deepEqual(parents.utilityItems.map((item) => item.title), ["Moved"]);
  assert.deepEqual(parents.groups[0].items.map((item) => item.title), ["Hidden", "Moved", "Kept"]);
  const plain = base(group([{ title: "Docs", children: [kid("A", "/a")] }]), { href: "/", active: false });
  assert.deepEqual(plain.siteItems.map((item) => item.title), ["Home", "Docs"]);
  assert.equal(Object.hasOwn(plain.siteItems[0], "placement"), false);
});

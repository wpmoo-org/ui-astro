import assert from "node:assert/strict";
import test from "node:test";
import { defineSite } from "../packages/astro/src/config/index.js";
import { resolveSitePresentation } from "../packages/astro/src/site/presentation.js";

const chrome = () => import("../packages/astro/src/site/chrome.js");
const taxonomies = [
  {
    id: "category",
    label: "Categories",
    locales: { de: { label: "Kategorien" } },
  },
  {
    id: "audience",
    label: "Audience",
    locales: { de: { label: "Zielgruppen" } },
  },
  { id: "unused", label: "Empty" },
];
const paths = [
  {
    props: {
      taxonomy: "category",
      term: { id: "guides", name: "Anleitungen" },
      href: "/de/kategorie/anleitungen",
    },
  },
  {
    props: {
      taxonomy: "category",
      term: { id: "news", name: "Neuigkeiten" },
      href: "/de/kategorie/neuigkeiten",
    },
  },
  {
    props: {
      taxonomy: "audience",
      term: { id: "students", name: "Studierende" },
      href: "/de/studierende",
    },
  },
];

test("taxonomy_groups_use_descriptor_labels_and_exact_entry_membership", async () => {
  const { groupTaxonomyLinks, entryTaxonomyGroups } = await chrome();
  const groups = groupTaxonomyLinks(taxonomies, paths, "de");
  assert.deepEqual(
    entryTaxonomyGroups(
      { taxonomies: { category: ["guides"], audience: ["students"] } },
      groups,
    ),
    [
      {
        id: "category",
        label: "Kategorien",
        links: [
          {
            id: "guides",
            label: "Anleitungen",
            href: "/de/kategorie/anleitungen",
          },
        ],
      },
      {
        id: "audience",
        label: "Zielgruppen",
        links: [
          { id: "students", label: "Studierende", href: "/de/studierende" },
        ],
      },
    ],
  );
  assert.deepEqual(entryTaxonomyGroups({}, groups), []);
  assert.deepEqual(
    entryTaxonomyGroups({ taxonomies: { category: ["unknown"] } }, groups),
    [],
  );
  assert.equal(groups[0].links.length, 2);
});

test("empty_and_custom_taxonomies_keep_separate_navigation_groups", async () => {
  const { groupTaxonomyLinks, buildSiteNavigation } = await chrome();
  const groups = groupTaxonomyLinks(taxonomies, paths, "de");
  const site = defineSite({ presentation: { navigation: "grouped" } });
  const context = {
    plugins: [
      { id: "page", label: "Pages", basePath: "/" },
      {
        id: "project",
        label: "Projects",
        basePath: "/projects",
        locales: { de: { basePath: "/projekte", label: "Projekte" } },
      },
    ],
  };
  const links = [
    { label: "Start", href: "/de", active: false },
    { label: "Über uns", href: "/de/ueber-uns", active: false },
    { label: "Projekte", href: "/de/projekte", active: true },
    { label: "Archiv", href: "/de/projekte/archiv", active: false },
  ];
  const input = {
    context,
    links,
    taxonomyGroups: groups,
    locale: "de",
    href: "/de/projekte",
    presentation: resolveSitePresentation(site, "de"),
    localHref: (path) => (path === "/" ? "/de" : `/de${path}`),
  };
  const navigation = buildSiteNavigation(input);
  assert.deepEqual(
    navigation.map((group) => group.label),
    ["Website", "Taxonomien"],
  );
  assert.deepEqual(
    navigation[0].items.map((item) => item.title),
    ["Seiten", "Projekte"],
  );
  assert.deepEqual(
    navigation[0].items[0].children.map((item) => item.href),
    ["/de", "/de/ueber-uns"],
  );
  assert.deepEqual(
    navigation[0].items[1].children.map((item) => item.href),
    ["/de/projekte", "/de/projekte/archiv"],
  );
  assert.equal(navigation[0].items[1].open, true);
  assert.deepEqual(
    navigation[1].items.map((item) => item.title),
    ["Kategorien", "Zielgruppen"],
  );
  assert.equal(navigation[1].items[0].children.length, 2);
  assert.equal(navigation[1].items[1].children.length, 1);
});

test("header projection separates real Home and groups all collections without mutating navigation", async () => {
  const { buildSiteNavigation, groupTaxonomyLinks, projectHeaderNavigation } = await chrome();
  const presentation = resolveSitePresentation(defineSite({ presentation: { navigation: "grouped" } }), "de");
  const taxonomyGroups = groupTaxonomyLinks(taxonomies, paths, "de");
  const navigation = buildSiteNavigation({
    context: { plugins: [{ id: "page", label: "Pages", basePath: "/" }, { id: "post", label: "Beiträge", basePath: "/beitraege" }] },
    links: [
      { label: "Willkommen", href: "/de", active: false },
      { label: "Über uns", href: "/de/ueber-uns", active: false },
      { label: "Beiträge", href: "/de/beitraege", active: false },
    ],
    taxonomyGroups, locale: "de", href: "/de/kategorie/anleitungen", presentation,
    localHref: (path) => path === "/" ? "/de" : `/de${path}`,
  });
  const original = structuredClone(navigation);
  const result = projectHeaderNavigation({
    navigation, taxonomyGroups, presentation,
    homeHref: "/de", homeNavigation: { href: "/de", active: false },
  });
  assert.deepEqual(result.siteItems.map((item) => item.title), ["Home", "Seiten", "Beiträge"]);
  assert.deepEqual(result.siteItems[1].children.map((item) => item.href), ["/de/ueber-uns"]);
  assert.deepEqual(result.collectionItems.map((item) => item.title), ["Kategorien", "Zielgruppen"]);
  assert.equal(result.collectionItems[0].open, true);
  assert.deepEqual(result.groups.map((group) => group.label), ["Website", "Collections"]);
  assert.deepEqual(result.collectionItems.flatMap((item) => item.children.map((link) => link.href)), paths.map((path) => path.props.href));
  assert.deepEqual(navigation, original);
});

test("header projection does not invent Home or empty Collections from a fallback brand URL", async () => {
  const { projectHeaderNavigation } = await chrome();
  const presentation = resolveSitePresentation(defineSite(), "en");
  const result = projectHeaderNavigation({
    navigation: [{ items: [{ title: "About", href: "/about", active: true }] }],
    taxonomyGroups: [], homeHref: "/about", homeNavigation: null, presentation,
  });
  assert.deepEqual(result.siteItems.map((item) => item.title), ["About"]);
  assert.deepEqual(result.collectionItems, []);
  assert.equal(result.groups.length, 1);
});

test("brand links Home when the root route exists even if navigation omits it", async () => {
  const { resolveHomeHref } = await chrome();
  const links = [{ label: "Einrichtungen", href: "/einrichtungen", active: false }];
  assert.equal(resolveHomeHref({ links, localeHome: "/", href: "/jobs", ownsRoot: true }), "/");
  assert.equal(resolveHomeHref({ links, localeHome: "/", href: "/jobs", ownsRoot: false }), "/einrichtungen");
  assert.equal(resolveHomeHref({ links: [], localeHome: "/", href: "/jobs", ownsRoot: false }), "/jobs");
  assert.equal(resolveHomeHref({ links: [{ label: "Start", href: "/de/", active: true }], localeHome: "/de", href: "/de/", ownsRoot: true }), "/de/");
});

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

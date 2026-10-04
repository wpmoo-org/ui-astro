// Example theme copy. Sites own their dictionaries and pass translated text to views.
const messages = {
  en: {
    site: "Site",
    examples: "Examples",
    posts: "Posts",
    taxonomies: "Taxonomies",
    views: "Views",
    components: "Components",
    nativePage: "Native Astro page",
    language: "Language",
    choosePageLanguage: "Choose page language",
    toggleSidebar: "Toggle sidebar",
    siteNavigation: "Site navigation",
    overview: "Overview",
    contact: "Contact · no Sidebar",
    guide: "Setup guide",
    single: "Single",
    archive: "Archive",
    pageArchive: "Page archive",
    customArchive: "Archive with custom slots",
    postArchive: "Post archive",
    firstPost: "Post · no Sidebar",
    secondPost: "Post · with Sidebar",
    categoryArchive: "Category · descendants",
    childCategoryArchive: "Child category",
    tagArchive: "Tag · mixed content",
    emptyTagArchive: "Empty tag",
    customTaxonomyArchive: "Custom taxonomy",
    breadcrumb: "Breadcrumb",
    skipToContent: "Skip to main content",
    emptyStateTitle: "Empty states",
    items: "Items",
    pages: "Pages",
    emptyItems: "No items yet.",
    emptyPages: "No pages yet.",
    emptyPosts: "No posts yet.",
    layoutLabel: "Layout profiles",
    layoutProfiles: {
      viewport: "Viewport shell",
      contained: "Contained shell",
      "fluid-header": "Explicit fluid Header",
      "right-sidebar": "Right inset Sidebar",
    },
    layoutDescription:
      "Moo UI shell and Page grid behavior with long semantic content.",
    pageGrid: "Page grid",
    gridItem: "Grid item",
    gridDescription: "Columns respond to the usable Page rail.",
    longContent: "Long content",
    longParagraph:
      "The published Moo UI App contract owns shell height and scrolling. The Astro host supplies semantic page content through the existing main rail.",
    longContentEnd: "End of long content.",
  },
  de: {
    site: "Website",
    examples: "Beispiele",
    posts: "Beiträge",
    taxonomies: "Taxonomien",
    views: "Ansichten",
    components: "Komponenten",
    nativePage: "Native Astro-Seite",
    language: "Sprache",
    choosePageLanguage: "Seitensprache wählen",
    toggleSidebar: "Sidebar umschalten",
    siteNavigation: "Seitennavigation",
    overview: "Übersicht",
    contact: "Kontakt · ohne Sidebar",
    guide: "Einrichtungsanleitung",
    single: "Single",
    archive: "Archive",
    pageArchive: "Seitenarchiv",
    customArchive: "Archiv mit eigenen Slots",
    postArchive: "Beitragsarchiv",
    firstPost: "Post · ohne Sidebar",
    secondPost: "Post · mit Sidebar",
    categoryArchive: "Kategorie · Unterkategorien",
    childCategoryArchive: "Unterkategorie",
    tagArchive: "Schlagwort · gemischte Inhalte",
    emptyTagArchive: "Leeres Schlagwort",
    customTaxonomyArchive: "Eigene Taxonomie",
    breadcrumb: "Navigationspfad",
    skipToContent: "Zum Hauptinhalt springen",
    emptyStateTitle: "Leere Listen",
    items: "Einträge",
    pages: "Seiten",
    emptyItems: "Noch keine Einträge.",
    emptyPages: "Noch keine Seiten.",
    emptyPosts: "Noch keine Beiträge.",
    layoutLabel: "Layout-Beispiele",
    layoutProfiles: {
      viewport: "Vollbild-Layout",
      contained: "Begrenztes Layout",
      "fluid-header": "Breiter Header",
      "right-sidebar": "Rechte inset Sidebar",
    },
    layoutDescription: "Moo UI und Page grid mit langen Inhalten.",
    pageGrid: "Page grid",
    gridItem: "Grid-Eintrag",
    gridDescription: "Die Spalten folgen der nutzbaren Page-Breite.",
    longContent: "Langer Inhalt",
    longParagraph:
      "Der veröffentlichte Moo UI App-Vertrag bestimmt die Höhe und das Scrollen. Astro liefert semantische Seiteninhalte im vorhandenen main-Bereich.",
    longContentEnd: "Ende des langen Inhalts.",
  },
};

export const demoLanguageLabels = Object.freeze({
  en: "English",
  de: "Deutsch",
});

export function getDemoLanguageLabel(locale) {
  const language = new Intl.Locale(locale).language;
  const label = Object.entries(demoLanguageLabels).find(
    ([key]) => key === language,
  )?.[1];
  if (!label)
    throw new TypeError(`Demo language label is missing for ${locale}`);
  return label;
}

export function getDemoMessages(locale) {
  const language = new Intl.Locale(locale).language;
  const selected = messages[language];
  if (!selected)
    throw new TypeError(`Demo translations are missing for ${locale}`);
  return selected;
}

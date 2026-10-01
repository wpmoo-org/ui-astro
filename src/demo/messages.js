// Example theme copy. Sites own their dictionaries and pass translated text to views.
const messages = {
  en: {
    site: "Site",
    examples: "Examples",
    overview: "Overview",
    contact: "Contact · no Sidebar",
    guide: "Setup guide",
    single: "Single",
    archive: "Archive",
    pageArchive: "Page archive",
    customArchive: "Archive with custom slots",
    breadcrumb: "Breadcrumb",
    emptyStateTitle: "Empty states",
    items: "Items",
    pages: "Pages",
    emptyItems: "No items yet.",
    emptyPages: "No pages yet.",
    layoutLabel: "Layout profiles",
    layoutProfiles: { viewport: "Viewport shell", contained: "Contained shell", "fluid-header": "Explicit fluid Header", "right-sidebar": "Right inset Sidebar" },
    layoutDescription: "Moo UI shell and Page grid behavior with long semantic content.",
    pageGrid: "Page grid",
    gridItem: "Grid item",
    gridDescription: "Columns respond to the usable Page rail.",
    longContent: "Long content",
    longParagraph: "The published Moo UI App contract owns shell height and scrolling. The Astro host supplies semantic page content through the existing main rail.",
    longContentEnd: "End of long content.",
  },
  de: {
    site: "Website",
    examples: "Beispiele",
    overview: "Übersicht",
    contact: "Kontakt · ohne Sidebar",
    guide: "Einrichtungsanleitung",
    single: "Single",
    archive: "Archive",
    pageArchive: "Seitenarchiv",
    customArchive: "Archiv mit eigenen Slots",
    breadcrumb: "Navigationspfad",
    emptyStateTitle: "Leere Listen",
    items: "Einträge",
    pages: "Seiten",
    emptyItems: "Noch keine Einträge.",
    emptyPages: "Noch keine Seiten.",
    layoutLabel: "Layout-Beispiele",
    layoutProfiles: { viewport: "Vollbild-Layout", contained: "Begrenztes Layout", "fluid-header": "Breiter Header", "right-sidebar": "Rechte inset Sidebar" },
    layoutDescription: "Moo UI und Page grid mit langen Inhalten.",
    pageGrid: "Page grid",
    gridItem: "Grid-Eintrag",
    gridDescription: "Die Spalten folgen der nutzbaren Page-Breite.",
    longContent: "Langer Inhalt",
    longParagraph: "Der veröffentlichte Moo UI App-Vertrag bestimmt die Höhe und das Scrollen. Astro liefert semantische Seiteninhalte im vorhandenen main-Bereich.",
    longContentEnd: "Ende des langen Inhalts.",
  },
};

export function getDemoMessages(locale) {
  const language = new Intl.Locale(locale).language;
  const selected = messages[language];
  if (!selected) throw new TypeError(`Demo translations are missing for ${locale}`);
  return selected;
}

// Example theme copy. Sites own their dictionaries and pass translated text to views.
const messages = {
  en: {
    breadcrumb: "Breadcrumb",
    emptyStateTitle: "Empty states",
    items: "Items",
    pages: "Pages",
    emptyItems: "No items yet.",
    emptyPages: "No pages yet.",
  },
  tr: {
    breadcrumb: "Gezinti yolu",
    emptyStateTitle: "Boş durumlar",
    items: "Öğeler",
    pages: "Sayfalar",
    emptyItems: "Henüz öğe yok.",
    emptyPages: "Henüz sayfa yok.",
  },
  de: {
    breadcrumb: "Navigationspfad",
    emptyStateTitle: "Leere Listen",
    items: "Einträge",
    pages: "Seiten",
    emptyItems: "Noch keine Einträge.",
    emptyPages: "Noch keine Seiten.",
  },
};

export function getDemoMessages(locale) {
  const language = new Intl.Locale(locale).language;
  const selected = messages[language];
  if (!selected) throw new TypeError(`Demo translations are missing for ${locale}`);
  return selected;
}

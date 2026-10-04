const messages = {
  en: {
    pages: "Pages",
    posts: "Blog",
    topics: "Topics",
    native: "Native action",
    toggle: "Toggle sidebar",
    navigation: "Site navigation",
    breadcrumb: "Breadcrumb",
    skip: "Skip to content",
    empty: "No entries yet.",
    action: "Explore the native page",
  },
  de: {
    pages: "Seiten",
    posts: "Beiträge",
    topics: "Themen",
    native: "Native Aktion",
    toggle: "Seitenleiste umschalten",
    navigation: "Seitennavigation",
    breadcrumb: "Brotkrümelnavigation",
    skip: "Zum Inhalt springen",
    empty: "Noch keine Einträge.",
    action: "Native Seite öffnen",
  },
};
export function getMessages(locale) {
  if (!Object.hasOwn(messages, locale))
    throw new TypeError(`Unknown pilot locale: ${locale}`);
  return messages[locale];
}

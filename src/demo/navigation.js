import { getDemoMessages } from "./messages.js";

// The example host owns these routes; they are excluded from the npm package.
export function getDemoNavigation(currentPath, locale) {
  const copy = getDemoMessages(locale);
  const path = currentPath.replace(/\/$/, "") || "/";
  const item = (title, href, icon) => ({ title, href, icon, active: path === href });
  return [
    { label: copy.site, items: [
      item(copy.overview, "/", "panel-left"),
      item(copy.contact, "/contact", "file-text"),
      item(copy.guide, "/guide/setup", "file-text"),
    ] },
    { label: copy.examples, items: [
      item(copy.single, "/preview/single", "file-text"),
      item(copy.archive, "/preview/archive", "layout-grid"),
      item(copy.pageArchive, "/preview/page-archive", "layout-grid"),
      item(copy.customArchive, "/preview/page-archive-slots", "layout-grid"),
      item(copy.postArchive, "/posts", "layout-grid"),
      item(copy.firstPost, "/posts/announcement", "file-text"),
      item(copy.secondPost, "/posts/layout-options", "file-text"),
      item(copy.emptyStateTitle, "/preview/i18n-empty", "layout-grid"),
      ...Object.entries(copy.layoutProfiles).map(([id, title]) => item(title, `/preview/layouts/${id}`, "panel-left")),
    ] },
  ];
}

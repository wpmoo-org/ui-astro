import { getSiteContext, getSiteNavigation } from "@wpmoo/astro/context";

export async function getThemeBreadcrumbs(title, pathname) {
  const { site } = getSiteContext();
  const homeHref = (await getSiteNavigation(pathname))[0]?.href;
  if (!homeHref)
    throw new Error("Theme requires its published home navigation entry");
  return [{ label: site.brand, href: homeHref }, { label: title }];
}

# Moo UI Astro

Moo UI Astro brings Moo UI components to Astro and provides a shared foundation
for websites and independently licensed themes.

It includes reusable page layouts, pages and posts, custom content types,
taxonomies, multilingual URLs, metadata and a built-in 404 page.

The package is currently available as an unpublished candidate.

## Get started

See the [guide](https://github.com/wpmoo-org/ui-astro/blob/main/docs/guide.md)
for installation, examples and development, and
[compatibility](COMPATIBILITY.md) for supported versions.

## Header options

All four options are optional and additive. Without them the markup is
unchanged, and the SDK adds no presentation CSS: it uses only Bootstrap and
Moo utility classes.

```js
moo({
  site: {
    brand: "Example",
    logo: {
      src: "/images/logo.svg", // string URL or an imported image (its .src is used)
      inverseSrc: "/images/logo-light.svg", // optional, for a dark surface
      alt: "Example",
      width: 120,
      height: 32,
      // brandText: true, // keep the brand text next to the image; alt may be ""
    },
    defaults: {
      sidebar: { mode: "header" },
      parts: { header: { surface: "dark" } },
    },
  },
});
```

```md
---
title: Jobs
navPlacement: utility # "main" (default) | "utility" | "drawer"
---
```

A plugin sets the same value with `placement` in a `navigation` item.

- **Site logo.** `site.logo` needs `width`, `height` and `alt` (plain text,
  non-empty unless `brandText: true`). The brand link shows the image
  (`data-slot="navigation-brand-logo"`) and takes its name from `alt`. With
  `brandText: true` the text stays visible and the image is decorative
  (`alt=""`). `SiteChrome.logo` is `null` without a logo. With `inverseSrc`
  the image is a `<picture>` whose `forced-colors` sources use `inverseSrc`
  in dark colour mode and `src` otherwise.
- **Drawer logo.** The drawer and the app sidebar show the same logo
  (`data-slot="sidebar-brand-logo"`) in place of the icon mark and title;
  the link's `aria-label` is the `alt` and the subtitle stays. The drawer
  always uses `src` (also in dark colour mode). `Sidebar` also accepts
  `brandLogo` directly.
- **Navigation placement.** Only with `sidebar.mode: "header"`: `"drawer"`
  items are left out of the desktop header row, `"utility"` items (top level
  or children) move to a small second row above the main row, inside the same
  `<nav>`. The drawer always lists every item in its normal order. In other
  modes `placement` is ignored. Put content into the utility row with the
  `header-utility` slot of `SiteLayout`; its content is desktop-only and is
  not part of the drawer; slot content is wrapped in one list item, so it
  should be links or other inline content. `Navigation` (style `navbar`)
  accepts `utilityItems`, `rowsClass` and a `utility` slot.
  Both rows stay in one `<nav>` landmark ("Site navigation"): every link in
  them is a site page, the drawer lists them together, and one landmark keeps
  screen-reader landmark lists short. The DOM order is main row, then utility
  row, so focus moves from the brand through the main links to the utility
  links although the utility row sits visually above.
- **Dark header surface.** `parts.header.surface: "dark"` (default
  `"default"`) renders the header with `moo-ui`, `data-bs-theme="dark"` and
  `data-header-surface="dark"` and keeps `parts.header.utilities`. It does
  nothing for `headerOverlay`, which is already dark. The header logo uses
  `inverseSrc` on the dark surface; with the default surface it always uses
  `src`, also in dark colour mode.

## License

[MIT](LICENSE). Themes and extensions can use their own licenses.

Dependency and icon licenses:
[@wpmoo/ui](https://github.com/wpmoo-org/ui/blob/v1.3.0/LICENSE),
[Bootstrap](https://github.com/twbs/bootstrap/blob/v5.3.8/LICENSE),
[Astro](https://github.com/withastro/astro/blob/astro%407.3.8/LICENSE) and
[Lucide / Feather](https://github.com/lucide-icons/lucide/blob/main/LICENSE).

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

## Site header

`@wpmoo/astro/blocks/SiteHeader.astro` mirrors the `site_header` block of Moo UI
Core (commit `a6db8f0`). Core is the source of truth for markup and
presentation; the SDK renders the same element tree natively and adds no CSS.

| Prop | Meaning |
| --- | --- |
| `id` | Required. One token; the drawer id is `id + "-drawer"`. |
| `ariaLabel` | Required. Name of the single `<nav>` landmark. |
| `brand` | `{ label, href?, mark?, subtitle?, dir?, showLabel?, logo?: { src, alt?, width?, height? } }`. `label` names the home link; a logo alone shows only the image. `mark` is an icon name (`blocks`, `panel-left`, `layout-grid` or `file-text`) shown in Core's Sidebar brand mark tile before the label; `mark` and `logo` are mutually exclusive. `subtitle` is plain text under the label and needs a visible label. A lockup (mark or logo with text) follows the page direction; `dir` (`"ltr"`, `"rtl"` or `"auto"`) fixes its order on an inner span. |
| `items` | `{ label, href?, active?, disabled?, drawerOnly?, children? }[]`. `children` become a dropdown. |
| `utilityItems` | Small secondary links, same keys. Shown as a row above the main row from the breakpoint up. |
| `breakpoint` | `"lg"` (default) or `"xl"`. |
| `surface` | `"default"` or `"dark"` (a nested dark Moo owner). |
| `container` | Container class, default `"container"`. |
| `menuLabel`, `closeLabel` | Toggler/drawer and close button names, default `"Menu"` and `"Close"`. |
| `class` | Extra classes for the `<nav>`, for example `sticky-top`. |

The default slot holds the header actions (for example a Button).

Use it as the page header through the `site-header` slot of `SiteLayout`, or
the `header-region` slot of `Layout` (rendered as a bare `<header>` with no
container, because the block brings its own; a compact TOC in `header-toc` still renders inside it):

```astro
<SiteLayout title="Home" options={options} href="/">
  <SiteHeader slot="site-header" id="site-header" ariaLabel="Main navigation"
    brand={{ label: "Moo UI", href: "/" }} items={items} />
  ...
</SiteLayout>
```

Rules:

- Use `shellMode: "document"` for websites.
- Set `container` to the page container class plus the rail inset, for example
  `container-xl px-3 px-md-5`, so header, content and footer share one edge.
- The slot replaces the default header: no theme toggle, language switcher or
  `header-actions`. It does not combine with any `sidebar` option (app sidebar, drawer or header navigation), and `Layout`
  `header-region` does not combine with `sidebar`, the `header` slot or
  `headerOverlay`.
- Every href must be a relative path, a fragment, a query, or use `http`,
  `https`, `mailto` or `tel`; anything else throws.
- Known limits (from Core): Escape inside the drawer closes the whole drawer,
  even with a dropdown open. The dark surface is a fixed nested owner, so keep a
  theme toggle outside the header or point it at the document owner.

Known differences from Core:

- `mark` accepts only the SDK icon set: `blocks`, `panel-left`,
  `layout-grid` and `file-text`. Core accepts any Lucide icon name. Other
  names throw Core's `Unknown Lucide icon` error.
- `logo: {}` throws "logo requires src". Core treats an empty logo as no
  logo.
- RTL is mirrored in the markup but not yet styled. Core's RTL styles
  (drawer side, dropdown caret, close button, brand margin) need a
  `@wpmoo/ui` package newer than 2.3.0.

## Sitemap and robots.txt

With the Astro `site` set, the integration writes `sitemap.xml` and
`robots.txt` at build from the built pages that name themselves as canonical
and are not `noindex`. A build without `site` fails unless
`moo({ site: { seo: { sitemap: false } } })` turns the sitemap off;
`seo.robots: false` or `seo.robots: { disallow: [...] }` configures
`robots.txt`. A host `public/robots.txt` or another sitemap writer fails the
build instead of being overwritten. `sitemap.xml` carries a stylesheet line
for `sitemap.xsl`, a readable view in the site's own CSS. Each locale also gets
an HTML sitemap page at `/sitemap/`, built from the `Table` and `Typography`
components and filled from the same scan; `seo.htmlSitemap: false` turns it
off, and `moo({ sitemap: { messages } })` overrides its copy per locale. See
the guide's "Sitemap and robots.txt".

## License

[MIT](LICENSE). Themes and extensions can use their own licenses.

Dependency and icon licenses:
[@wpmoo/ui](https://github.com/wpmoo-org/ui/blob/v1.3.0/LICENSE),
[Bootstrap](https://github.com/twbs/bootstrap/blob/v5.3.8/LICENSE),
[Astro](https://github.com/withastro/astro/blob/astro%407.3.8/LICENSE) and
[Lucide / Feather](https://github.com/lucide-icons/lucide/blob/main/LICENSE).

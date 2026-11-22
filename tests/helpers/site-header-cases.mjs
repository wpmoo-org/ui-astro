// Site header parity inputs shared by the fixture sync script and the test.
// `examples` are Core's catalog previews (site/src/blocks/site_header_example
// .html.jinja, rendered in site-dist/blocks/previews/<name>/); `brandCases`
// are rendered straight from Core's site_header macro. Props are the SDK's
// (camelCase); the sync script converts them to Core's keyword arguments.

export const BRAND = "Moo UI";
const LOGO_SRC = "../../../assets/images/site-header/logo.svg";
const logo = { src: LOGO_SRC, alt: BRAND, width: 32, height: 32 };
const items = [
  { label: "Home", href: "#home", active: true },
  { label: "About", href: "#about", children: [
    { label: "Our team", href: "#team" },
    { label: "History", href: "#history" },
    { label: "Careers", href: "#careers", disabled: true },
  ] },
  { label: "Programmes", href: "#programmes" },
  { label: "News", href: "#news" },
  { label: "Contact", href: "#contact" },
  { label: "Donate", href: "#donate", drawerOnly: true },
];
const utilityItems = [
  { label: "Parents", href: "#parents" },
  { label: "Press", href: "#press" },
  { label: "Deutsch", href: "#de" },
];
// Core's button macro renders the label on its own line.
const apply = (variant) =>
  `<a class="btn btn-${variant} btn-sm" href="#apply">\n      Apply\n    </a>`;
const markBrand = { label: BRAND, href: "#home", mark: "blocks", subtitle: "Component system" };

export const examples = {
  "site-header": {
    kind: "text",
    props: { id: "site-header-preview", ariaLabel: "Main navigation", brand: markBrand, items: items.slice(0, 5) },
    action: apply("primary"),
  },
  "site-header-logo": {
    kind: "logo",
    props: { id: "site-header-logo-preview", ariaLabel: "Main navigation", brand: { label: BRAND, href: "#home", showLabel: true, logo }, items, utilityItems },
    action: apply("primary"),
  },
  "site-header-dark": {
    kind: "dark",
    props: { id: "site-header-dark-preview", ariaLabel: "Main navigation", brand: { label: BRAND, href: "#home", mark: "blocks" }, items, utilityItems, surface: "dark", breakpoint: "xl" },
    action: apply("outline-secondary"),
  },
  // Core's preview wraps this header in <div dir="rtl">; the nav itself
  // carries no dir, so the fixture holds the nav only.
  "site-header-rtl": {
    kind: "rtl",
    props: { id: "site-header-rtl-preview", ariaLabel: "Main navigation", brand: markBrand, items: items.slice(0, 5) },
    action: apply("primary"),
  },
};

const one = [{ label: "Home", href: "/", active: true }];
const brandCase = (brand) => ({ id: "hdr", ariaLabel: "Main navigation", brand: { href: "/", ...brand }, items: one });
const small = { src: "/logo.svg", alt: "Logo name", width: 32, height: 32 };

export const brandCases = {
  "brand-mark": brandCase({ label: "A", mark: "blocks" }),
  "brand-mark-subtitle": brandCase({ label: "A", mark: "blocks", subtitle: "Sub" }),
  "brand-mark-dir-ltr": brandCase({ label: "A", mark: "blocks", dir: "ltr" }),
  "brand-mark-dir-rtl": brandCase({ label: "A", mark: "blocks", subtitle: "Sub", dir: "rtl" }),
  "brand-mark-dir-auto": brandCase({ label: "A", mark: "blocks", dir: "auto" }),
  "brand-mark-panel-left": brandCase({ label: "A", mark: "panel-left" }),
  "brand-mark-layout-grid": brandCase({ label: "A", mark: "layout-grid" }),
  "brand-mark-file-text": brandCase({ label: "A", mark: "file-text" }),
  "brand-logo-label": brandCase({ label: "A", showLabel: true, logo: small }),
  "brand-logo-label-subtitle-dir-rtl": brandCase({ label: "A", subtitle: "Sub", showLabel: true, logo: small, dir: "rtl" }),
  "brand-logo-only": brandCase({ label: "A", logo: small }),
  "brand-logo-only-dir-rtl": brandCase({ label: "A", logo: small, dir: "rtl" }),
  "brand-text": brandCase({ label: "A" }),
  "brand-text-subtitle": brandCase({ label: "A", subtitle: "Sub" }),
  "brand-text-dir-rtl": brandCase({ label: "A", dir: "rtl" }),
};

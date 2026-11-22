// Layout renders that must stay byte-identical when the site-header slots are
// unused. The snapshot in tests/fixtures/layout-default/ was generated at the
// commit recorded in its source.json.
export const layoutCases = {
  "header-slot": { props: { title: "T" }, slots: { default: "<p>x</p>", header: "<span>h</span>", footer: "<span>f</span>" } },
  "document-shell": { props: { title: "T", shellMode: "document" }, slots: { default: "<p>x</p>", header: "<span>h</span>", "header-toc": "<nav>toc</nav>", "footer-region": "<span>f</span>", "before-header": "<i>b</i>", "after-footer": "<i>a</i>" } },
  "sidebar": { props: { title: "T", sidebar: true, sidebarId: "s", sidebarKey: "k" }, slots: { default: "<p>x</p>", sidebar: "<aside></aside>", footer: "<span>f</span>" } },
  "no-header": { props: { title: "T" }, slots: { default: "<p>x</p>" } },
};

// The demo site's consent configuration: categories and services with
// English and German text. "marketing" has no service, so it stays hidden.
// No revision is given; the SDK computes Core's rule at build time.
/** @type {import("@wpmoo/astro/blocks/consent-config.js").ConsentConfig} */
export const consent = {
  cookie: { name: "moo_consent_demo" },
  links: [
    { label: { en: "Cookie policy", de: "Cookie-Richtlinie" }, href: "#cookie-policy" },
    { label: { en: "Privacy policy", de: "Datenschutzerklärung" }, href: "#privacy" },
    { label: { en: "Legal notice", de: "Impressum" }, href: "#legal-notice" },
  ],
  categories: [
    {
      id: "functional",
      required: true,
      label: { en: "Functional", de: "Funktional" },
      description: {
        en: "Needed for the site to work: the chosen language and colour mode, and this choice.",
        de: "Für den Betrieb der Website erforderlich: die gewählte Sprache und Farbdarstellung sowie diese Auswahl.",
      },
      services: [
        {
          id: "site",
          name: { en: "Site preferences", de: "Website-Einstellungen" },
          provider: { en: "This website", de: "Diese Website" },
          purpose: { en: "Language, colour mode and consent", de: "Sprache, Farbdarstellung und Einwilligung" },
          storage: [
            { name: "moo_consent_demo", type: "cookie", lifetime: { en: "12 months", de: "12 Monate" } },
            { name: "moo-website:*", type: "local", lifetime: { en: "Until removed", de: "Bis zur Löschung" } },
          ],
        },
      ],
    },
    {
      id: "statistics",
      label: { en: "Statistics", de: "Statistiken" },
      description: {
        en: "Counts of visits and pages, measured on our own server, so we know which content helps.",
        de: "Zählt Besuche und Seiten auf unserem eigenen Server, damit wir wissen, welche Inhalte helfen.",
      },
      services: [
        {
          id: "matomo",
          name: "Matomo",
          provider: { en: "This website (self-hosted)", de: "Diese Website (selbst gehostet)" },
          purpose: { en: "Visit and page statistics", de: "Besuchs- und Seitenstatistik" },
          storage: [
            { name: "_pk_id.*", type: "cookie", lifetime: { en: "13 months", de: "13 Monate" } },
            { name: "_pk_ses.*", type: "cookie", lifetime: { en: "30 minutes", de: "30 Minuten" } },
          ],
        },
      ],
    },
    {
      id: "external_media",
      label: { en: "External media", de: "Externe Medien" },
      description: {
        en: "Videos and maps from other providers. They load from the provider's servers, which then receive your IP address.",
        de: "Videos und Karten anderer Anbieter. Sie werden von deren Servern geladen, die dabei Ihre IP-Adresse erhalten.",
      },
      services: [
        {
          id: "video",
          name: { en: "Video platform", de: "Videoplattform" },
          provider: "Example Video Ltd.",
          purpose: { en: "Play embedded videos", de: "Eingebettete Videos abspielen" },
          privacyUrl: "#video-privacy",
          storage: [{ name: "Provider cookies", type: "cookie", lifetime: { en: "Up to 6 months", de: "Bis zu 6 Monate" } }],
        },
      ],
    },
    { id: "marketing", label: { en: "Marketing", de: "Marketing" }, services: [] },
  ],
};

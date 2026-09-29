import { normalizeSlug } from "@wpmoo/astro/config";

if (normalizeSlug("İletişim", { lang: "tr" }) !== "iletisim") {
  throw new Error("The public config import did not normalize the content slug");
}

export const collections = {};

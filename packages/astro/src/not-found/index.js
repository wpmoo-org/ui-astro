import profile from "virtual:wpmoo-astro/not-found";
import { resolveNotFoundOptions } from "./options.js";

/** Resolve collection-free native error copy, preferences and locale home links. */
export function getNotFoundOptions(locale) {
  return resolveNotFoundOptions(profile, locale);
}

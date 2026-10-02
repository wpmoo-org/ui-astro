import { z } from "astro/zod";
import { defineSite } from "../config/index.js";
import { authoredDate } from "../content/dates.js";

const text = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\x00-\x1f\x7f]/u.test(value), "must be plain text");
const httpUrl = z.string().refine((value) => {
  if (!/^https?:\/\//iu.test(value) || /[\s\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}, "must be an absolute HTTP(S) URL without credentials or whitespace");
const canonicalUrl = httpUrl.refine((value) => {
  try {
    const url = new URL(value);
    return !url.search && !url.hash;
  } catch {
    return false;
  }
}, "canonical URL must not contain a query or fragment");
const date = z.union([authoredDate, z.date()]);
const routeSchema = z.strictObject({
  title: text,
  description: z.string().optional(),
  url: canonicalUrl,
  status: z.enum(["publish", "draft", "pending", "future"]),
  type: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .optional(),
  view: z.enum(["home", "single", "archive", "native"]),
  lang: z
    .string()
    .refine((value) => {
      try {
        return Intl.getCanonicalLocales(value).length === 1;
      } catch {
        return false;
      }
    }, "must be a valid locale")
    .optional(),
  created_at: date.optional(),
  published_at: date.optional(),
  updated_at: date.optional(),
  author: z.strictObject({ name: text, url: httpUrl.optional() }).optional(),
  image: httpUrl.optional(),
  alternates: z
    .array(
      z.strictObject({
        locale: z.string().refine((value) => {
          try {
            return Intl.getCanonicalLocales(value).length === 1;
          } catch {
            return false;
          }
        }, "must be a valid locale"),
        url: canonicalUrl,
      }),
    )
    .optional(),
});

function ownedFrozen(value) {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") ownedFrozen(nested);
  }
  return Object.freeze(value);
}

export function resolveSeoMetadata(site, route) {
  const config = defineSite(site);
  const result = routeSchema.safeParse(route);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = [...issue.path, ...(issue.keys ?? [])].join(".");
    throw new TypeError(`route${path ? `.${path}` : ""}: ${issue.message}`);
  }
  const data = result.data;
  if (data.status !== "publish") return null;
  const article = data.type === "post" && data.view === "single";
  if (
    article &&
    (!data.published_at ||
      (typeof route.published_at === "string" &&
        !route.published_at.includes("T")))
  ) {
    throw new TypeError(
      "route.published_at: published Post requires a timezone-qualified datetime",
    );
  }
  const lang = data.lang ?? config.defaults.lang;
  if (!routeSchema.shape.lang.safeParse(lang).success) {
    throw new TypeError("site.defaults.lang: SEO requires a valid locale");
  }
  const organization = config.organization;
  const organizationName = organization?.names?.[lang] ?? organization?.name;
  const templates = config.seo?.titleTemplates;
  const localized = templates?.locales?.[lang];
  const typeTemplate = (group) =>
    data.type && Object.hasOwn(group?.types ?? {}, data.type)
      ? group.types[data.type]?.[data.view]
      : undefined;
  const selected =
    data.view === "home"
      ? (localized?.home ??
        templates?.home ??
        localized?.default ??
        templates?.default)
      : (typeTemplate(localized) ??
        typeTemplate(templates) ??
        localized?.default ??
        templates?.default);
  const fallback = organizationName
    ? data.view === "home"
      ? "{organization.name}"
      : "{title} | {organization.name}"
    : "{title}";
  const title = (selected ?? fallback).replace(
    /\{(title|organization\.name)\}/gu,
    (_, key) => (key === "title" ? data.title : organizationName),
  );
  const canonical = new URL(data.url).href;
  if (data.alternates?.length) {
    if (
      new Set(data.alternates.map((item) => item.locale)).size !==
      data.alternates.length
    )
      throw new TypeError("route.alternates must have unique locales");
    if (
      !data.alternates.some(
        (item) => item.locale === lang && new URL(item.url).href === canonical,
      )
    )
      throw new TypeError(
        "route.alternates must include the current locale and self-canonical URL",
      );
  }
  const optional = {
    ...(data.description !== undefined
      ? { description: data.description }
      : {}),
    ...(data.image ? { image: new URL(data.image).href } : {}),
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": article ? "BlogPosting" : "WebPage",
    [article ? "headline" : "name"]: data.title,
    url: canonical,
    ...optional,
    ...(data.created_at ? { dateCreated: data.created_at.toISOString() } : {}),
    ...(data.published_at
      ? { datePublished: data.published_at.toISOString() }
      : {}),
    ...(data.updated_at ? { dateModified: data.updated_at.toISOString() } : {}),
    ...(organizationName
      ? { publisher: { "@type": "Organization", name: organizationName } }
      : {}),
    ...(data.author
      ? {
          author: {
            "@type": "Person",
            name: data.author.name,
            ...(data.author.url ? { url: new URL(data.author.url).href } : {}),
          },
        }
      : {}),
  };
  return ownedFrozen({
    title,
    ...(data.description !== undefined
      ? { description: data.description }
      : {}),
    canonical,
    openGraph: {
      title,
      type: article ? "article" : "website",
      url: canonical,
      ...optional,
      ...(organizationName ? { site_name: organizationName } : {}),
    },
    twitter: {
      card: data.image ? "summary_large_image" : "summary",
      title,
      ...optional,
    },
    jsonLd,
    ...(data.alternates?.length
      ? {
          alternates: data.alternates.map((item) => ({
            locale: item.locale,
            url: new URL(item.url).href,
          })),
        }
      : {}),
  });
}

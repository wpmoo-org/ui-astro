import profile, {
  factories,
  collections,
  getAssignedTerms,
  getKnownTerms,
  getChrome,
} from "virtual:wpmoo-astro/placements";
import { getCollection, render } from "astro:content";
import { createHash } from "node:crypto";
import { freeze, record, text } from "./options.js";
import { selectPlacements, validateResolvedPlacements } from "./match.js";
import { selectContentBlock, validateContentBlocks } from "./content.js";
import { filterHeadings } from "../blocks/table-of-contents/headings.js";
import {
  resolveSitePresentation,
  resolveContentLinks,
} from "../site/presentation.js";
export { contentBlockSchema } from "./content.js";

export async function preparePlacements(input) {
  record(input, "placement context", [
    "href",
    "locale",
    "view",
    "type",
    "title",
    "entry",
    "taxonomy",
    "headings",
  ]);
  text(input.href, "placement context.href");
  const locale =
    input.locale ?? profile.i18n?.defaultLocale ?? profile.site.defaults.lang;
  if (!(profile.i18n?.locales ?? [profile.site.defaults.lang]).includes(locale))
    throw new TypeError(`Unknown placement context locale ${locale}`);
  if (
    !["home", "single", "archive", "taxonomy", "native", "not-found"].includes(
      input.view,
    )
  )
    throw new TypeError(`Unknown placement context view ${input.view}`);
  const entry = input.entry
    ? {
        id: input.entry.id,
        translationKey: input.entry.translationKey,
        taxonomies: structuredClone(input.entry.taxonomies ?? {}),
        data: structuredClone(input.entry.data ?? {}),
      }
    : undefined;
  const context = freeze({
    ...input,
    locale,
    entry,
    headings: filterHeadings(input.headings ?? [], [1, 2, 3, 4, 5, 6]),
    assignedTerms: [],
  });
  const presentation = resolveSitePresentation(profile.site, locale);
  const links = resolveContentLinks(profile.site, {
    locale,
    i18n: profile.i18n,
    base: profile.base,
    trailingSlash: profile.trailingSlash,
  });
  let assignedTerms = [];
  if (profile.active && Object.keys(entry?.taxonomies ?? {}).length)
    assignedTerms = await getAssignedTerms(entry, input.type, locale);
  const preparedContext = freeze({ ...context, assignedTerms });
  const contentCollections = new Map();
  for (const [id, definition] of Object.entries(profile.blocks)) {
    if (definition.kind !== "content") continue;
    if (!Object.hasOwn(collections, definition.collection))
      throw new TypeError(
        `Block ${id} refers to missing native collection ${definition.collection}`,
      );
    if (!contentCollections.has(definition.collection)) {
      const entries = await getCollection(definition.collection);
      validateContentBlocks(
        entries,
        Boolean(profile.i18n),
        profile.site.defaults.lang,
      );
      for (const entry of entries) {
        if (
          entry.data.locale &&
          profile.i18n &&
          !profile.i18n.locales.includes(entry.data.locale)
        )
          throw new TypeError(
            `Block ${entry.id} has unconfigured locale ${entry.data.locale}`,
          );
      }
      contentCollections.set(definition.collection, entries);
    }
    selectContentBlock(
      contentCollections.get(definition.collection),
      definition.translationKey,
      locale,
      Boolean(profile.i18n),
    );
  }
  await validateContentReferences(profile);
  const contentId = `moo-content-${createHash("sha256").update(input.href).digest("hex").slice(0, 10)}`;
  const groups = Object.create(null);
  const prepared = [];
  for (const placement of selectPlacements(profile, preparedContext)) {
    if (placement.at.startsWith("entry.") && !entry) continue;
    if (
      placement.at.startsWith("archive.") &&
      !["archive", "taxonomy"].includes(input.view)
    )
      continue;
    const instanceId = `moo-block-${createHash("sha256").update(input.href).digest("hex").slice(0, 10)}-${placement.id}`;
    const base = { ...placement, instanceId };
    if (placement.block === "toc") {
      const tocItems = filterHeadings(
        preparedContext.headings,
        placement.props.depths,
      ).map(({ slug, text }) => Object.freeze({ targetId: slug, label: text }));
      if (!tocItems.length) continue;
      prepared.push({
        ...base,
        kind: "toc",
        tocItems: Object.freeze(tocItems),
      });
    } else if (placement.block === "entry-taxonomies") {
      if (assignedTerms.length)
        prepared.push({ ...base, kind: "entry-taxonomies" });
    } else {
      const definition = profile.blocks[placement.block];
      if (definition.kind === "component")
        prepared.push({
          ...base,
          kind: "component",
          Component: factories[placement.block],
        });
      else {
        const selected = selectContentBlock(
          contentCollections.get(definition.collection),
          definition.translationKey,
          locale,
          Boolean(profile.i18n),
        );
        if (selected) {
          const { Content, headings } = await render(selected);
          prepared.push({
            ...base,
            kind: "content",
            Component: Content,
            title: selected.data.title,
            headings,
          });
        }
      }
    }
  }
  validateResolvedPlacements(prepared);
  if (
    entry &&
    assignedTerms.length &&
    presentation.assignedTaxonomies &&
    !prepared.some((p) => p.mode === "replace")
  )
    prepared.unshift({
      id: "_default-taxonomies",
      block: "entry-taxonomies",
      at: "entry.taxonomies",
      order: 10,
      mode: "append",
      props: {},
      kind: "entry-taxonomies",
      instanceId: "moo-default-taxonomies",
    });
  prepared.sort((a, b) => a.order - b.order);
  for (const placement of prepared)
    (groups[placement.at] ??= []).push(Object.freeze(placement));
  for (const group of Object.values(groups)) Object.freeze(group);
  return Object.freeze({
    contentId,
    chrome: freeze(
      await getChrome({
        href: input.href,
        locale,
        title: input.title ?? profile.site.brand,
      }),
    ),
    context: preparedContext,
    groups: Object.freeze(groups),
    labels: presentation.labels,
    links,
  });
}

async function validateContentReferences(profile) {
  const conditions = profile.placements
    .flatMap((p) => [p.include, p.exclude])
    .filter(Boolean);
  if (!conditions.some((c) => c.entries || c.translationKeys || c.terms))
    return;
  const entries = [];
  for (const collection of new Set(Object.values(profile.typeCollections)))
    entries.push(...(await getCollection(collection)));
  for (const placement of profile.placements) {
    for (const condition of [placement.include, placement.exclude]) {
      for (const id of condition?.entries ?? [])
        if (!entries.some((entry) => entry.id === id))
          throw new TypeError(
            `Placement ${placement.id} refers to missing entry ${id}`,
          );
      for (const key of condition?.translationKeys ?? [])
        if (!entries.some((entry) => entry.data.translationKey === key))
          throw new TypeError(
            `Placement ${placement.id} refers to missing translationKey ${key}`,
          );
      for (const [id, terms] of Object.entries(condition?.terms ?? {})) {
        const known = await getKnownTerms(id);
        for (const term of terms)
          if (!known.some((entry) => entry.id === term))
            throw new TypeError(
              `Placement ${placement.id} refers to missing term ${id}/${term}`,
            );
      }
    }
  }
}

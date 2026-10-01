import { defineSite, resolvePageOptions, resolveParts, formatDate, type PartsInput, type UtilityToken } from "@wpmoo/astro/config";
const utilities: readonly UtilityToken[] = ["py-3", "py-md-5", "bg-body-tertiary"];
const parts: PartsInput = { content: { utilities }, header: { trigger: { variant: "outline" } }, loop: { dateStyle: "medium" } };
const site = defineSite({ defaults: { parts }, types: { post: { views: { single: { parts: { content: { utilities: [] } } } } } } });
const resolved = resolvePageOptions(site, "post", "single");
formatDate(new Date(), { lang: resolved.lang, style: resolved.parts.loop.dateStyle });
// @ts-expect-error Resolved utility arrays are immutable.
resolved.parts.content.utilities.push("py-2");
// @ts-expect-error Nested resolved component props are immutable.
resolved.parts.header.trigger.variant = "ghost";
// @ts-expect-error Normalized authored type preferences are immutable.
site.types.post.parts!.content!.utilities = [];
// @ts-expect-error Theme choices use registered helpers only.
resolveParts({ content: { utilities: ["private-padding"] } });
// @ts-expect-error Unsupported date styles cannot enter normalized options.
resolveParts({ loop: { dateStyle: "custom" } });
// @ts-expect-error Moo page-title owns its mapped font weight.
resolveParts({ pageHeader: { titleUtilities: ["fw-normal"] } });
// @ts-expect-error Moo description variants own their mapped text color.
resolveParts({ pageHeader: { descriptionUtilities: ["text-primary"] } });
// @ts-expect-error Moo page-description owns its zero bottom margin.
resolveParts({ pageHeader: { descriptionUtilities: ["mb-3"] } });
resolveParts({ pageHeader: { descriptionVariant: "muted", descriptionUtilities: ["mb-3"] } });
resolveParts({ pageHeader: { descriptionUtilities: ["text-body-secondary", "mb-0"] } });

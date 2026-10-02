import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import {
  resolvePageOptions,
  defineSite,
  type PageOptionsInput,
} from "@wpmoo/astro/config";
import { sectionsSchema, type Section } from "./sections";

const text: Section = {
  id: "intro",
  type: "text",
  props: { heading: "Introduction", text: "Editable text." },
};
const action: Section = {
  id: "next",
  type: "action",
  props: { label: "Next", href: "/plain" },
};
sectionsSchema.parse([text, action]);
const options: PageOptionsInput = {
  sidebar: { rail: false, defaultOpen: false },
  parts: { content: { utilities: [] } },
};
const entry = pageSchema.parse({
  title: "Typed Page",
  status: "publish",
  options,
});
resolvePageOptions(
  defineSite({ defaults: { sidebar: {} } }),
  "page",
  "single",
  entry.options,
);
// @ts-expect-error Section type names belong to the host's finite schema.
const unknown: Section = { id: "invalid", type: "hero", props: {} };
const mismatched: Section = {
  id: "invalid",
  type: "text",
  // @ts-expect-error A Text instance cannot accept Action props.
  props: { label: "Next", href: "/plain" },
};
void [unknown, mismatched];

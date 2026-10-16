import { z } from "astro/zod";

// Pure metadata can be consumed by a file editor without evaluating a renderer.
export const sectionMetadata = {
  text: { label: "Text", fields: { heading: "text", text: "text" } },
  action: { label: "Action", fields: { label: "text", href: "link" } },
} as const;

const instanceId = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
    "Section id must be lowercase kebab case",
  );
const safeHref = z.string().refine((href) => {
  if (/[\s\\\u0000-\u001f\u007f]/u.test(href)) return false;
  if (href.startsWith("#")) return href.length > 1;
  if (href.startsWith("/")) return !href.startsWith("//");
  try {
    return ["http:", "https:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}, "Action href must be a safe link");
export const sectionSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: instanceId,
      type: z.literal("text"),
      props: z
        .object({ heading: z.string().min(1), text: z.string() })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: instanceId,
      type: z.literal("action"),
      props: z.object({ label: z.string().min(1), href: safeHref }).strict(),
    })
    .strict(),
]);
export const sectionsSchema = z
  .array(sectionSchema)
  .superRefine((sections, context) => {
    const ids = new Set<string>();
    sections.forEach((section, index) => {
      if (ids.has(section.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate section id: ${section.id}`,
        });
      ids.add(section.id);
    });
  });
export type Section = z.infer<typeof sectionSchema>;

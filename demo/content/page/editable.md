---
title: Page with sections
description: File-based content rendered with reusable Moo UI sections.
status: publish
locale: en
created_at: "2026-09-18T12:00:00Z"
published_at: "2026-09-20T12:00:00Z"
updated_at: "2026-09-21T12:00:00Z"
taxonomies:
  category: [layouts]
  tag: [astro]
  sector: [foundation]
sections:
  - id: introduction
    type: text
    props:
      heading: File-managed content
      text: Edit this text in the Page file. Its section identity remains unchanged when you move it.
  - id: related-content
    type: action
    props:
      label: Explore related content
      href: /topics/category/layouts
---

This Page combines a Markdown body with two reusable sections. The title,
description, taxonomy references and section order are stored in its frontmatter.

The same content files can be edited directly or connected to an optional editor.

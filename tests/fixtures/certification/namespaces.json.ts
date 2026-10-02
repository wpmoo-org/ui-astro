import type { APIRoute } from "astro";
import * as root from "@wpmoo/astro";
import * as config from "@wpmoo/astro/config";
import * as content from "@wpmoo/astro/content";
import * as context from "@wpmoo/astro/context";
import * as plugins from "@wpmoo/astro/plugins";
import * as page from "@wpmoo/astro/plugins/page";
import * as pageContent from "@wpmoo/astro/plugins/page/content";
import * as pageQueries from "@wpmoo/astro/plugins/page/queries";
import * as post from "@wpmoo/astro/plugins/post";
import * as postContent from "@wpmoo/astro/plugins/post/content";
import * as postQueries from "@wpmoo/astro/plugins/post/queries";
import * as taxonomies from "@wpmoo/astro/taxonomies";
import * as taxonomyContent from "@wpmoo/astro/taxonomies/content";
import * as taxonomyQueries from "@wpmoo/astro/taxonomies/queries";
import * as seo from "@wpmoo/astro/seo";
import * as i18n from "@wpmoo/astro/i18n";

export const GET: APIRoute = () =>
  Response.json(
    Object.fromEntries(
      Object.entries({
        root,
        config,
        content,
        context,
        plugins,
        page,
        pageContent,
        pageQueries,
        post,
        postContent,
        postQueries,
        taxonomies,
        taxonomyContent,
        taxonomyQueries,
        seo,
        i18n,
      }).map(([name, module]) => [name, Object.keys(module).sort()]),
    ),
  );

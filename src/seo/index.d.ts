import type { SiteConfig } from "../config/index.js";
import type { PublicationStatus } from "../content/index.js";

export interface SeoRoute {
  title: string;
  description?: string;
  /** Absolute URL of the actual emitted route, including its host base and slash policy. */
  url: string;
  status: PublicationStatus;
  type?: string;
  view: "home" | "single" | "archive" | "native";
  lang?: string;
  created_at?: string | Date;
  published_at?: string | Date;
  updated_at?: string | Date;
  author?: { readonly name: string; readonly url?: string };
  image?: string;
  alternates?: readonly { readonly locale: string; readonly url: string }[];
}

export interface SeoMetadata {
  readonly title: string;
  readonly description?: string;
  readonly canonical: string;
  readonly alternates?: readonly {
    readonly locale: string;
    readonly url: string;
  }[];
  readonly openGraph: Readonly<{
    title: string;
    type: "website" | "article";
    url: string;
    description?: string;
    image?: string;
    site_name?: string;
  }>;
  readonly twitter: Readonly<{
    card: "summary" | "summary_large_image";
    title: string;
    description?: string;
    image?: string;
  }>;
  readonly jsonLd: Readonly<{
    "@context": "https://schema.org";
    "@type": "WebPage" | "BlogPosting";
    name?: string;
    headline?: string;
    url: string;
    description?: string;
    image?: string;
    dateCreated?: string;
    datePublished?: string;
    dateModified?: string;
    publisher?: Readonly<{ "@type": "Organization"; name: string }>;
    author?: Readonly<{ "@type": "Person"; name: string; url?: string }>;
  }>;
}

/** Returns plain text data; Layout escapes HTML once and serializes JSON-LD as script-safe data. */
export declare function resolveSeoMetadata(
  site: SiteConfig,
  route: SeoRoute,
): SeoMetadata | null;

import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// /robots.txt: every crawler may read the site, search engines and AI crawlers alike. Only /api is closed, it is the
// backend and has nothing to index. The pages of the app aren't disallowed on purpose: they are sent with
// X-Robots-Tag: noindex (next.config.ts), and a crawler that isn't allowed to fetch a page never sees that header, so
// a linked page could still be listed without content.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

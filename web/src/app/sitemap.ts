import type { MetadataRoute } from "next";

import { INDEXED_ROUTES, SITE_URL } from "@/lib/site";

// Without lastModified, since a date that doesn't change with the content makes search engines ignore it

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXED_ROUTES.map((route) => ({ url: route === "/" ? SITE_URL : `${SITE_URL}${route}` }));
}

// The public address of the web app and the App Store entry of the iOS app, for the metadata, robots.txt, the sitemap
// and the links of the landing page. The domains are fixed like in docker-compose.prod.yml.

/** The hosted web app, the base of the canonical URLs and of metadataBase */
export const SITE_URL = "https://gym2.app";

/** The App Store ID of the iOS app (also in ios/.../AppUpdateService.swift), for the Smart App Banner of Safari */
export const APP_STORE_ID = "6695759065";

export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** The pages for search engines: everything else needs an account and is sent with X-Robots-Tag: noindex */
export const INDEXED_ROUTES = ["/", "/privacy", "/tos"] as const;

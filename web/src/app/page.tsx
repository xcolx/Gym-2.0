import type { Metadata } from "next";

import { LandingPage as Landing } from "@/components/landing/LandingPage";
import { SOURCE_CODE_URL } from "@/components/landing/brand";
import { APP_STORE_ID, APP_STORE_URL, SITE_URL } from "@/lib/site";

// A server component, so it is readable without JavaScript and by crawlers. The sections are in components/landing.

const TITLE = "Gym 2.0 – Track your workouts, see every muscle you trained";
const DESCRIPTION =
  "A free, open source workout tracker for iPhone and the web: log your sets, see which muscles you trained, get suggested workouts and train with friends. No ads, no tracking.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  // The Smart App Banner of Safari on iPhone, it opens the App Store entry of the iOS app (only on this page, not in
  // the web app itself)
  itunes: { appId: APP_STORE_ID },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Gym 2.0",
    title: TITLE,
    description: "A free, open source workout tracker for iPhone and the web. No ads, no tracking.",
  },
  twitter: { card: "summary_large_image" },
};

// The app for search engines and AI assistants (https://schema.org/WebApplication), the iOS app as the same software
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Gym 2.0",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "HealthApplication",
  operatingSystem: "Web, iOS 17 or later",
  browserRequirements: "Requires JavaScript",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  image: `${SITE_URL}/icons/icon-512.png`,
  installUrl: APP_STORE_URL,
  sameAs: [APP_STORE_URL, SOURCE_CODE_URL],
  author: { "@type": "Person", name: "Colin Rüegg", url: "https://www.colinrueegg.com" },
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // "<" escaped, so no string of the data can close the script tag
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }}
      />
      <Landing />
    </>
  );
}

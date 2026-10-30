import { Features } from "./Features";
import { FinalCallToAction } from "./FinalCallToAction";
import { Hero } from "./Hero";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { PrivacySection } from "./PrivacySection";
import { Showcase } from "./Showcase";

// Only server components, so the page is readable without JavaScript and by crawlers. The animations of the cards and
// the start button are in app/globals.css.

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <LandingHeader />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <PrivacySection />
        <FinalCallToAction />
      </main>
      <LandingFooter />
    </div>
  );
}

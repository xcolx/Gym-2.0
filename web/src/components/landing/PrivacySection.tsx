import type { ReactNode } from "react";
import { Code, ExternalLink, Globe, ShieldCheck, type LucideIcon } from "lucide-react";

import { SOURCE_CODE_URL } from "./brand";
import { SectionTitle } from "./SectionTitle";

export function PrivacySection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-24 md:px-6 md:pt-32">
      <SectionTitle eyebrow="Private by design" title="Your training data stays yours." />
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        <PrivacyCard icon={ShieldCheck} title="No ads, no tracking">
          No analytics, no third-party SDKs, and your data is never sold or used to train AI models.
        </PrivacyCard>
        <PrivacyCard icon={Globe} title="Hosted in Switzerland">
          The server, the database and Gym-AI run on hardware in Switzerland. Download or delete your data anytime.
        </PrivacyCard>
        <PrivacyCard icon={Code} title="Open source">
          Every line of the apps and the server is public, so you can check how your data is handled.{" "}
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#e00000] hover:underline dark:text-[#ff5a4e]"
          >
            View on GitHub
            <ExternalLink size={13} aria-hidden />
          </a>
        </PrivacyCard>
      </ul>
    </section>
  );
}

function PrivacyCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="rounded-3xl border border-separator p-6">
      <Icon size={26} className="text-[#e00000] dark:text-[#ff5a4e]" aria-hidden />
      <h3 className="mt-4 text-[19px] font-bold">{title}</h3>
      <p className="mt-2 text-[15px] leading-6 text-secondary-label">{children}</p>
    </li>
  );
}

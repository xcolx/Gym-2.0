import { A, LegalPage, Section } from "@/components/ui/LegalPage";

import packages from "./third-party-licenses.json";

// The licences and notices of the open source packages in the web app, which their licences require to be passed on
// with it. third-party-licenses.json is written by scripts/generate-licenses.mjs. The iOS app only uses Apple's
// frameworks, the backend isn't distributed.

const SOURCE_CODE_URL = "https://github.com/xcolx/Gym-2.0";

export function ThirdPartyLicenses() {
  return (
    <LegalPage title="Third-Party Licenses">
      <Section title="Gym 2.0">
        <p>
          Gym 2.0 is open source under the GNU Affero General Public License v3 with additional terms, see the{" "}
          <A href={SOURCE_CODE_URL}>source code</A>. The web app contains the following open source packages. Their
          licenses and notices are reproduced below.
        </p>
      </Section>

      <Section title="Packages">
        <ul className="flex flex-col divide-y divide-separator border-y border-separator">
          {packages.map((pkg) => (
            <li key={`${pkg.name}@${pkg.version}`}>
              <details className="group py-3">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {pkg.name} <span className="font-normal text-secondary-label">{pkg.version}</span>
                  </span>
                  <span className="shrink-0 text-footnote text-secondary-label">{pkg.license}</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {pkg.repository && (
                    <p className="text-footnote">
                      <A href={pkg.repository}>{pkg.repository.replace(/^https:\/\//, "")}</A>
                    </p>
                  )}
                  {pkg.texts.length === 0 ? (
                    <p className="text-footnote text-secondary-label">
                      The package contains no license file. It is published under the {pkg.license} license
                      {pkg.repository ? " of its repository" : ""}.
                    </p>
                  ) : (
                    pkg.texts.map((text, index) => (
                      <pre
                        key={index}
                        className="overflow-x-auto rounded-xl bg-field/40 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap"
                      >
                        {text}
                      </pre>
                    ))
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Section>
    </LegalPage>
  );
}

import type { Metadata } from "next";

import { ThirdPartyLicenses } from "@/components/legal/ThirdPartyLicenses";

export const metadata: Metadata = {
  title: "Third-Party Licenses – Gym 2.0",
  description: "The open source packages in the Gym 2.0 web app and their licenses.",
};

export default function ThirdPartyLicensesPage() {
  return <ThirdPartyLicenses />;
}

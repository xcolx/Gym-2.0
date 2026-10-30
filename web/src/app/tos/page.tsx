import type { Metadata } from "next";

import { TermsOfUse } from "@/components/legal/TermsOfUse";

export const metadata: Metadata = {
  title: "Terms of Use – Gym 2.0",
  description: "The rules for using Gym 2.0, the content you share in it and the Gym-AI.",
  alternates: { canonical: "/tos" },
};

export default function TermsOfUsePage() {
  return <TermsOfUse />;
}

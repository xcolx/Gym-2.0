import type { Metadata } from "next";

import { PrivacyPolicy } from "@/components/legal/PrivacyPolicy";

export const metadata: Metadata = {
  title: "Privacy Policy – Gym 2.0",
  description: "Which data Gym 2.0 processes, why, where it is stored, who receives it and which rights you have.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicy />;
}

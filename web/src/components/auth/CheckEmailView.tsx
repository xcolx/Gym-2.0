"use client";

import { Mail } from "lucide-react";

import { Spinner } from "@/components/ui/controls";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

import { AuthBackBar } from "./AuthParts";
import { useResendVerification } from "./use-auth-forms";

/** The account can only be used once the email is verified with the link the server sent. */
export function CheckEmailView({
  email,
  message,
  onBack,
  showLogin,
}: {
  email: string;
  message: string;
  onBack: () => void;
  showLogin: () => void;
}) {
  const { isLoading, resendMessage, resend } = useResendVerification(email);

  return (
    <main className="flex min-h-dvh flex-col bg-grouped pb-[calc(8px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <AuthBackBar onBack={onBack} />
      <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col items-center px-6 text-center">
        <div className="flex-1" />

        {/* envelope.badge */}
        <span className="relative flex size-24 items-center justify-center rounded-full bg-app/12 text-app" aria-hidden>
          <Mail size={42} strokeWidth={1.75} />
          <span className="absolute right-[22px] top-[25px] size-3.5 rounded-full border-2 border-[color-mix(in_srgb,var(--app-color)_12%,var(--grouped-bg))] bg-app" />
        </span>

        <h1 className="mt-5 text-title font-bold">Check your email</h1>
        <p className="mt-2 text-secondary-label">
          We sent a link to <strong className="font-semibold text-foreground">{email}</strong>. Open it to verify your email
          address, then come back and log in.
        </p>
        {message && <p className="mt-3 text-footnote text-secondary-label">{message}</p>}

        <div className="flex-[2]" />

        <PrimaryButton onClick={showLogin}>Go to log in</PrimaryButton>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void resend()}
          className="mt-4 flex min-h-6 items-center text-subheadline font-medium text-app hover:underline active:opacity-50 disabled:opacity-40"
        >
          {isLoading ? <Spinner /> : "Didn't get it? Send it again"}
        </button>
        {resendMessage && (
          <p role="status" className="mt-1.5 text-footnote text-secondary-label">
            {resendMessage}
          </p>
        )}
      </div>
    </main>
  );
}

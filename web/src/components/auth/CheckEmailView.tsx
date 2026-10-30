"use client";

import { Mail } from "lucide-react";

import { PageHeader } from "@/components/ui/Page";

import { useResendVerification } from "./use-auth-forms";

/** The account can only be used once the email is verified with the link the server sent. */
export function CheckEmailView({ email, message, showLogin }: { email: string; message: string; showLogin: () => void }) {
  const { isLoading, resendMessage, resend } = useResendVerification(email);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <PageHeader title="Verify Email" inline />
      <div className="flex flex-1 flex-col items-center gap-5 p-4 text-center">
        <div className="flex-1" />
        <span className="relative text-app" aria-hidden>
          <Mail size={64} strokeWidth={1.5} />
          <span className="absolute right-0 top-1 h-4 w-4 rounded-full border-2 border-background bg-[#ff3b30]" />
        </span>
        <h1 className="text-title font-bold">Check your emails</h1>
        <p>
          We sent a link to <strong>{email}</strong>. Open it to verify your email address, then come back and log in.
        </p>
        <p className="text-footnote text-secondary-label">{message}</p>
        <div className="flex-1" />
        <button
          type="button"
          onClick={showLogin}
          className="min-h-[50px] w-full rounded-[12px] bg-app px-4 text-headline text-white active:opacity-60"
        >
          Go to Login
        </button>
        <div className="flex flex-col items-center gap-1.5">
          <button type="button" disabled={isLoading} onClick={() => void resend()} className="text-app active:opacity-50 disabled:opacity-40">
            Didn&apos;t get an email? Send it again
          </button>
          {resendMessage && <p className="text-footnote text-secondary-label">{resendMessage}</p>}
        </div>
      </div>
    </main>
  );
}

"use client";

import type { User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { continueWithGoogle } from "@/lib/google-auth";
import { cn } from "@/lib/utils";

/** Google's "G", in its own colours (their brand rules ask for it unaltered). */
export function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google": the first choice wherever someone signs in. On a hostel's address it
 * leaves for Google and comes back signed in; `onUser` runs straight away on the platform address.
 */
export function GoogleButton({
  onUser,
  label = "Continue with Google",
  returnTo,
  beforeLeave,
  className,
}: {
  onUser?: (user: User) => void;
  label?: string;
  returnTo?: string;
  /** Runs before the page may leave for Google (e.g. to keep a half-filled form) */
  beforeLeave?: () => Promise<void> | void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const click = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await beforeLeave?.();
      // Not `onUser?.(await …)`: with no onUser that would skip the sign-in itself
      const user = await continueWithGoogle(returnTo);
      onUser?.(user);
    } catch (err) {
      // Closing the popup isn't an error worth showing
      if (!(err instanceof FirebaseError && (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request"))) {
        setProblem(err instanceof FirebaseError && err.code === "auth/popup-blocked" ? "Your browser blocked the Google window. Allow pop-ups and try again." : "Couldn't sign in with Google. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className={cn(
          "flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 text-[16px] font-semibold text-grey-950 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_-12px_rgba(16,24,40,0.25)] ring-1 ring-grey-150 transition hover:bg-grey-10 hover:ring-grey-300 disabled:opacity-70",
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin text-heading-6" /> : <GoogleG className="size-5" />}
        {busy ? "Opening Google…" : label}
      </button>
      {problem && <p className="mt-2 text-center text-sm text-rose-600">{problem}</p>}
    </div>
  );
}

/** In place of the login options while a Google sign-in is being finished. */
export function SigningIn() {
  return (
    <div className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-grey-10 text-[15px] font-medium text-heading-4" role="status">
      <Loader2 className="size-5 animate-spin text-brand-600" /> Signing you in with Google…
    </div>
  );
}

/** The quiet divider between Google and the email option. */
export function OrDivider({ label = "or use your email" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-medium tracking-wide text-heading-6 uppercase">
      <span className="h-px flex-1 bg-grey-100" />
      {label}
      <span className="h-px flex-1 bg-grey-100" />
    </div>
  );
}

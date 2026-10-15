"use client";

import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, BedDouble, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLayout } from "@/components/BrandLayout";
import { toast } from "@/components/toast";
import { Button, Input, PasswordInput } from "@/components/ui";
import { authMessage, homeFor, useSession } from "@/lib/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const { user, role } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in (or just signed in): go where this account belongs
  useEffect(() => {
    if (!user || !role) return;
    const next = new URLSearchParams(window.location.search).get("next");
    const home = homeFor(role);
    router.replace(next && (role === "admin" ? !next.startsWith("/portal") : next.startsWith("/portal")) ? next : home);
  }, [user, role, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      toast(authMessage(err), "info");
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return toast("Enter your email first, then tap Forgot password.", "info");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast("Password reset link sent. Check your email.");
    } catch (err) {
      toast(authMessage(err), "info");
    }
  };

  return (
    <BrandLayout
      title="Your room, your rent, all in one place."
      subtitle="For tenants and hostel managers."
      action={{ href: "/book", label: "Book a room", phoneOnly: true }}
    >
      <div className="mx-auto w-full max-w-sm lg:my-auto">
        <h1 className="text-2xl font-semibold tracking-tight text-grey-950">Welcome back</h1>
        <p className="mt-1.5 text-sm text-heading-6">Log in to your tenant portal or the hostel dashboard.</p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-heading-4">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-grey-400" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
                className="h-12 rounded-xl pl-10 text-[15px]"
              />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-medium text-heading-4">
                Password
              </label>
              <button type="button" onClick={forgot} className="text-xs font-medium text-brand-700 hover:underline">
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-grey-400" />
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                required
                className="h-12 rounded-xl pl-10 text-[15px]"
              />
            </div>
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl text-[15px]" disabled={busy || user === undefined}>
            {busy ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Logging in…
              </>
            ) : (
              <>
                Log in <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>

        <div className="my-8 flex items-center gap-3 text-xs text-heading-6">
          <span className="h-px flex-1 bg-grey-100" />
          New here?
          <span className="h-px flex-1 bg-grey-100" />
        </div>

        <Link
          href="/book"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-grey-150 bg-white text-[15px] font-medium text-heading-3 transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <BedDouble className="size-4.5 text-brand-600" strokeWidth={1.8} /> Book a room
        </Link>
        <p className="mt-4 text-center text-xs text-heading-6">You&apos;ll create your login when you book and pay for a room.</p>
      </div>
    </BrandLayout>
  );
}

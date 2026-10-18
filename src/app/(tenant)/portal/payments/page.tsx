"use client";

import { CalendarClock, ChevronRight, Lock, Receipt, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui";
import { auth } from "@/lib/firebase";
import { confirmWithRetry, openPaystack, postJSON } from "@/lib/paystack-client";
import { tenantRent, useTenant } from "@/lib/tenant-store";
import { addMonths, cn, daysLeft, describeDaysLeft, formatDate, naira, todayISO } from "@/lib/utils";

interface RenewalResult {
  status: "paid" | "pending" | "needs_attention" | "failed";
  receiptNo?: string;
  paymentId?: string;
  leaseEnd?: string;
}

export default function PaymentsPage() {
  const t = useTenant();
  const r = t.resident!;
  const info = t.info;
  const rent = tenantRent(t);
  const [busy, setBusy] = useState<"" | "starting" | "confirming">("");
  const left = daysLeft(r);
  const today = todayISO();
  // What this payment would cover: from the current end date (or today if already expired)
  const nextStart = r.leaseEnd >= today ? r.leaseEnd : today;
  const nextEnd = info ? addMonths(nextStart, info.leaseMonths) : nextStart;
  const total = t.payments.reduce((sum, p) => sum + p.amount, 0);

  const confirm = async (reference: string) => {
    setBusy("confirming");
    try {
      const res = await confirmWithRetry<RenewalResult>("/api/rent/verify", reference);
      if (res.status === "paid") toast(`Payment confirmed. Receipt ${res.receiptNo}. Your rent now runs until ${formatDate(res.leaseEnd)}.`);
      else if (res.status === "needs_attention") toast("Payment received. The manager will confirm it shortly.", "info");
      else if (res.status === "failed") toast("That payment didn't go through. No money was taken.", "info");
      else toast("Still confirming your payment. Your rent date updates automatically once it's through.", "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't confirm payment", "info");
    } finally {
      setBusy("");
    }
  };

  // Paystack's redirect fallback returns here with ?reference=RN-…
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("reference");
    if (ref?.startsWith("RN-")) {
      window.history.replaceState(null, "", window.location.pathname);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off check of the URL on arrival
      confirm(ref);
    }
  }, []);

  const pay = async () => {
    setBusy("starting");
    try {
      const token = await auth.currentUser!.getIdToken();
      const start = await postJSON<{ reference: string; accessCode: string }>("/api/rent/start", {}, token);
      await openPaystack(start.accessCode, {
        success: confirm,
        cancel: () => toast("Payment not completed. You can try again any time.", "info"),
        error: (m) => toast(m, "info"),
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't start payment", "info");
    } finally {
      setBusy((b) => (b === "starting" ? "" : b));
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight text-grey-950">Payments</h1>

      <section className="rounded-3xl border border-grey-100 bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-heading-6 uppercase">Next rent</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-grey-950">{info ? naira(rent) : "—"}</p>
            <p className="mt-1 text-sm text-heading-6">
              Covers {formatDate(nextStart)} – {formatDate(nextEnd)}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
              left < 0 ? "bg-rose-50 text-rose-700" : left <= 30 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700",
            )}
          >
            {left < 0 ? "Overdue" : left <= 30 ? "Due soon" : "Up to date"}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-grey-10 px-3 py-2.5">
          <CalendarClock className="size-4.5 shrink-0 text-heading-6" />
          <span className="text-sm">
            <span className="block text-heading-4">Current rent ends {formatDate(r.leaseEnd)}</span>
            <span className="block text-xs font-medium text-heading-6">{describeDaysLeft(left)}</span>
          </span>
        </div>

        <Button className="mt-5 h-12 w-full rounded-xl text-[15px]" onClick={pay} disabled={!!busy || !info}>
          {busy === "confirming" ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Confirming payment…
            </>
          ) : (
            <>
              <Lock className="size-4" /> {busy === "starting" ? "Opening payment…" : left > 30 ? `Renew early · ${info ? naira(rent) : ""}` : `Pay ${info ? naira(rent) : ""}`}
            </>
          )}
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-heading-6">
          <ShieldCheck className="size-3.5" /> Secured by Paystack. Paying early never loses you days.
        </p>
      </section>

      <section className="rounded-2xl border border-grey-100 bg-white">
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-grey-950">Receipts</h2>
          {t.payments.length > 0 && <span className="text-xs text-heading-6">{naira(total)} paid in total</span>}
        </header>
        {t.payments.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-heading-6">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-grey-100">
            {t.payments.map((p) => (
              <li key={p.id}>
                <Link href={`/portal/payments/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-grey-10">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Receipt className="size-4.5" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-grey-950">{naira(p.amount)}</span>
                    <span className="block truncate text-xs text-heading-6">
                      {p.receiptNo} · {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </span>
                  </span>
                  <span className="rounded-full bg-grey-50 px-2 py-0.5 text-[11px] font-medium text-heading-5">{p.method}</span>
                  <ChevronRight className="size-4 shrink-0 text-heading-6" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

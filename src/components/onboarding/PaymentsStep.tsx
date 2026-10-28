"use client";

import { ArrowDown, BadgeCheck, CircleAlert, Landmark, Loader2, Lock, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Select } from "@/components/ui";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { big, Label, NavButtons, Problem, Question } from "./shell";

/*
 * Sign-up, part three: where rent goes. One screen: pick the bank, type the account number, and
 * the name the bank holds appears by itself to confirm. Confirming creates the hostel's Paystack
 * payout account (subaccount), so rent paid online settles straight there.
 */

interface Bank {
  name: string;
  code: string;
}

type Lookup = { status: "idle" | "checking" | "found" | "error"; name?: string; bankName?: string; message?: string };

async function post<T>(body: object): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch("/api/onboarding/payout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T & { error?: string } };
}

/** How the money moves, with this hostel's account filled in once it's found. */
function MoneyFlow({ hostelName, lookup }: { hostelName: string; lookup: Lookup }) {
  const step = "flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5";
  const icon = "flex size-10 shrink-0 items-center justify-center rounded-xl";
  return (
    <div className="space-y-2">
      <p className="mb-3 text-sm font-semibold tracking-wide text-brand-700 uppercase">How the money moves</p>
      <div className={step}>
        <span className={cn(icon, "bg-grey-50 text-heading-4")}>
          <Smartphone className="size-5" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-grey-950">A tenant pays online</p>
          <p className="text-sm text-heading-6">Card, bank transfer or USSD</p>
        </div>
      </div>
      <ArrowDown className="mx-auto size-4 text-brand-300" />
      <div className={step}>
        <span className={cn(icon, "bg-[#e6f4fb] text-[#0b72a8]")}>
          <Lock className="size-5" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-grey-950">Paystack takes the payment</p>
          <p className="text-sm text-heading-6">A licensed Nigerian payment company</p>
        </div>
      </div>
      <ArrowDown className="mx-auto size-4 text-brand-300" />
      <div className={cn(step, lookup.status === "found" && "ring-2 ring-brand-500")}>
        <span className={cn(icon, "bg-brand-100 text-brand-800")}>
          <Landmark className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-grey-950">Your full rent, to your account</p>
          <p className="truncate text-sm text-heading-6">{lookup.status === "found" ? `${lookup.name} · ${lookup.bankName}` : `${hostelName}'s bank account`}</p>
          <p className="text-xs text-heading-6">Usually the next working day</p>
        </div>
      </div>
      <p className="pt-3 text-sm leading-relaxed text-heading-6">HostelHub never holds your rent. Our small service fee is paid by the tenant, on top.</p>
    </div>
  );
}

export function PaymentsStep({ hostelId, hostelName, onBack, onDone }: { hostelId: string; hostelName: string; onBack: () => void; onDone: () => void }) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [testBank, setTestBank] = useState<{ name: string; account: string } | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef("");

  useEffect(() => {
    fetch("/api/onboarding/payout")
      .then((r) => r.json())
      .then((d: { banks?: Bank[]; testBank?: { name: string; account: string } | null; error?: string }) => {
        if (!d.banks) throw new Error(d.error);
        setBanks(d.banks);
        setTestBank(d.testBank ?? null);
      })
      .catch((err) => setProblem(err instanceof Error && err.message ? err.message : "Couldn't load the list of banks. Refresh to try again."));
  }, []);

  // Look the account up as soon as there's a bank and 10 digits
  useEffect(() => {
    const key = `${bankCode}:${accountNumber}`;
    if (!bankCode || accountNumber.length !== 10) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a lookup for an incomplete number
      setLookup({ status: "idle" });
      return;
    }
    if (asked.current === key) return;
    asked.current = key;
    setLookup({ status: "checking" });
    let live = true;
    post<{ accountName: string; bankName: string }>({ hostelId, bankCode, accountNumber }).then(
      ({ ok, data }) => live && setLookup(ok ? { status: "found", name: data.accountName, bankName: data.bankName } : { status: "error", message: data.error }),
      () => live && setLookup({ status: "error", message: "Couldn't check the account. Check your connection." }),
    );
    return () => {
      live = false;
      asked.current = "";
    };
  }, [hostelId, bankCode, accountNumber]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!bankCode) return setProblem("Pick your bank.");
    if (accountNumber.length !== 10) return setProblem("Enter your 10-digit account number.");
    if (lookup.status === "checking") return setProblem("Checking the account. One moment…");
    if (lookup.status !== "found") return setProblem(lookup.message ?? "We couldn't find that account. Check the number and the bank.");
    setBusy(true);
    try {
      const { ok, data } = await post<{ saved: boolean }>({ hostelId, bankCode, accountNumber, confirm: true });
      if (!ok) throw new Error(data.error ?? "Couldn't save. Please try again.");
      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20">
      <form onSubmit={submit} noValidate className="mx-auto w-full max-w-xl lg:mx-0">
        <p className="mb-4 text-sm font-medium text-brand-700">One question</p>
        <Question title="Where should your rent go?" hint="Rent tenants pay online goes straight to this account. Use the account your hostel's rent normally goes to.">
          {testBank && (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
              <b>Test site:</b> real accounts can&apos;t be checked here. Pick <b>{testBank.name}</b> and enter <b className="tabular-nums">{testBank.account}</b>.
            </p>
          )}
          <div>
            <Label htmlFor="bank">Bank</Label>
            {banks ? (
              <Select id="bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)} searchable searchPlaceholder="Search banks…" className="h-14 rounded-2xl px-4 text-lg!">
                <option value="">Pick your bank</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex h-14 items-center gap-2 rounded-2xl border border-grey-150 bg-white px-4 text-heading-6">
                <Loader2 className="size-4 animate-spin" /> Loading banks…
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="account">Account number</Label>
            <input
              id="account"
              inputMode="numeric"
              autoComplete="off"
              className={cn(big, "h-14 tracking-wide tabular-nums")}
              placeholder="10 digits"
              value={accountNumber}
              onChange={(e) => {
                setProblem(null);
                setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
              }}
            />
          </div>

          <div aria-live="polite">
            {lookup.status === "checking" && (
              <p className="flex items-center gap-2 text-[15px] text-heading-6">
                <Loader2 className="size-4 animate-spin" /> Checking with the bank…
              </p>
            )}
            {lookup.status === "found" && (
              <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200 motion-safe:animate-[pop-in_0.25s_ease-out]">
                <BadgeCheck className="mt-0.5 size-6 shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <p className="text-lg font-semibold break-words text-brand-950">{lookup.name}</p>
                  <p className="text-[15px] text-brand-900/80">
                    {lookup.bankName} · {accountNumber}
                  </p>
                  <p className="mt-1 text-sm text-brand-900/70">Is this the right account? If not, check the number or the bank.</p>
                </div>
              </div>
            )}
            {lookup.status === "error" && lookup.message && (
              <p className="flex items-start gap-2 text-[15px] text-rose-600">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {lookup.message}
              </p>
            )}
          </div>
        </Question>

        {problem && (
          <div className="mt-6">
            <Problem>{problem}</Problem>
          </div>
        )}
        <NavButtons onBack={onBack} busy={busy} busyLabel="Setting up payouts…" label={lookup.status === "found" ? "Yes, send rent here" : "Continue"} />
      </form>

      <aside className="hidden lg:block" aria-label="How the money moves">
        <div className="sticky top-32">
          <MoneyFlow hostelName={hostelName} lookup={lookup} />
        </div>
      </aside>
    </div>
  );
}

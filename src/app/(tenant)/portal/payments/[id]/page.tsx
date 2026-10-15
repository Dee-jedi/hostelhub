"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui";
import { useTenant } from "@/lib/tenant-store";
import { formatDate, naira } from "@/lib/utils";

/** A printable receipt. "Print / Save as PDF" uses the browser's print dialog; the shell hides itself when printing. */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTenant();
  const r = t.resident!;
  const p = t.payments.find((x) => x.id === id);

  if (!p) {
    return (
      <div className="py-16 text-center text-sm text-heading-6">
        Receipt not found.{" "}
        <Link href="/portal/payments" className="font-medium text-brand-700 hover:underline">
          Back to payments
        </Link>
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Received from", r.fullName],
    ["Room", p.roomId ?? r.roomId ?? "—"],
    ["For rent period", `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`],
    ["Payment method", p.method === "Online" ? "Online (Paystack)" : p.method],
    ["Reference", p.reference || "—"],
    ["Date paid", formatDate(p.date)],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/portal/payments" className="inline-flex items-center gap-1.5 text-sm font-medium text-heading-5 hover:text-heading-2">
          <ArrowLeft className="size-4" /> Payments
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
      </div>

      <article className="relative overflow-hidden rounded-3xl border border-grey-100 bg-white print:rounded-none print:border-0">
        <header className="bg-brand-900 px-6 py-6 text-white print:bg-white print:px-0 print:text-grey-950">
          <p className="text-lg font-semibold">{t.info?.hostelName}</p>
          {t.info?.address && <p className="text-sm text-brand-100/80 print:text-heading-6">{t.info.address}</p>}
        </header>

        <div className="px-6 py-6 print:px-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-heading-6 uppercase">Rent receipt</p>
              <p className="mt-1 font-mono text-sm text-heading-4">{p.receiptNo}</p>
            </div>
            <span className="-rotate-6 rounded-lg border-2 border-emerald-600 px-3 py-1 text-sm font-bold tracking-widest text-emerald-700">PAID</span>
          </div>

          <p className="mt-6 text-4xl font-semibold tracking-tight text-grey-950">{naira(p.amount)}</p>

          <dl className="mt-6 divide-y divide-dashed divide-grey-150 border-y border-dashed border-grey-150 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-3">
                <dt className="text-heading-6">{label}</dt>
                <dd className="text-right font-medium break-all text-grey-950">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-xs text-heading-6">
            This receipt was issued automatically by HostelHub for {t.info?.hostelName}. Keep it for your records.
          </p>
        </div>
      </article>
    </div>
  );
}

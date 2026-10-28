import { CheckCircle2, Clock, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A booking that is paid but not placed yet ("received"), or whose payment Paystack is still
 * settling ("processing"). Shared by the booking page and the portal so both say the same thing,
 * always with the reference to quote and the manager's number, and never invite a second payment.
 */
export function BookingWaiting({
  kind,
  reference,
  managerPhone,
  className,
  children,
}: {
  kind: "received" | "processing";
  reference?: string;
  managerPhone?: string;
  className?: string;
  children?: ReactNode;
}) {
  const received = kind === "received";
  const Icon = received ? CheckCircle2 : Clock;
  return (
    <section className={cn("text-center", className)}>
      <Icon className={cn("mx-auto size-14", received ? "text-amber-500" : "text-heading-6")} strokeWidth={1.6} />
      <h2 className="mt-4 text-xl font-medium text-grey-950">{received ? "Payment received, room coming" : "Still confirming your payment"}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-heading-6">
        {received
          ? "Your money is safe, but we couldn't place you in a room automatically. The hostel manager has been notified and will allocate you a room shortly."
          : "Bank transfers, OPay and USSD payments can take a few minutes. If you were debited, your room will be confirmed automatically."}
      </p>
      <p className="mx-auto mt-3 max-w-sm text-sm font-medium text-grey-950">Please don&apos;t pay again.</p>
      {reference && (
        <p className="mt-4 text-xs text-heading-6">
          Payment reference <span className="font-mono text-sm font-semibold tracking-wide text-grey-950 select-all">{reference}</span>
        </p>
      )}
      {managerPhone && (
        <a href={`tel:${managerPhone.replace(/[^\d+]/g, "")}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          <Phone className="size-4" /> Call the manager: {managerPhone}
        </a>
      )}
      {children}
    </section>
  );
}

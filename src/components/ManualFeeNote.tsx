import { ReceiptText } from "lucide-react";
import { naira } from "@/lib/utils";

/** Explains HostelHub's fee on rent collected outside HostelHub, beside the forms that charge it. */
export function ManualFeeNote({ fee, collected }: { fee: number; collected: number }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
      <ReceiptText className="mt-0.5 size-4 shrink-0 text-amber-700" />
      <p>
        <b>HostelHub fee: {naira(fee)}</b>, paid by you now (card, transfer or OPay), because {naira(collected)} of rent was collected outside HostelHub. When tenants pay online, through
        their booking or portal, there&apos;s nothing for you to pay.
      </p>
    </div>
  );
}

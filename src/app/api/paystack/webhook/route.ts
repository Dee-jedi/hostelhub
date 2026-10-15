import { BookingError, finalizeBooking } from "@/lib/server/bookings";
import { finalizeRenewal } from "@/lib/server/renewals";
import { isValidWebhook } from "@/lib/server/paystack";

/**
 * Paystack calls this directly when a charge succeeds, so a booking still completes if the
 * student closes the tab before the popup reports back. Set the URL in the Paystack dashboard.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!isValidWebhook(raw, req.headers.get("x-paystack-signature"))) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(raw) as { event: string; data?: { reference?: string } };
  const reference = event.data?.reference ?? "";
  // HH- = new booking from /book, RN- = rent renewal from the tenant portal
  if (event.event === "charge.success" && (reference.startsWith("HH-") || reference.startsWith("RN-"))) {
    try {
      await (reference.startsWith("RN-") ? finalizeRenewal(reference) : finalizeBooking(reference));
    } catch (err) {
      if (!(err instanceof BookingError)) {
        console.error("paystack/webhook", err);
        return new Response("Retry later", { status: 500 });
      }
    }
  }
  return new Response("ok");
}

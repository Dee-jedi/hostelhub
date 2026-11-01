import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, LegalPage } from "@/components/site/LegalPage";
import { SERVICE_FEE } from "@/lib/fees";
import { JOIN_DAYS_AFTER_LIVE } from "@/lib/join";
import { CONTACT } from "@/lib/platform";
import { naira } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Terms of Service · HostelHub",
  description: "The terms for using HostelHub, for tenants and for hostels.",
};

const feePercent = Math.round(SERVICE_FEE.rate * 100);

/** HostelHub's terms of service, for tenants and for hostels. The fees come from fees.ts, so they never drift. */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms apply when you use HostelHub, whether you&apos;re a tenant booking or living in a room, or a hostel, lodge or apartment using HostelHub to run your property. HostelHub
          is operated by {LEGAL.operator} (RC {LEGAL.rc}), a company registered in Nigeria (&ldquo;HostelHub&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account, booking, paying or
          setting up a hostel, you agree to these terms and to our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      }
    >
      <section>
        <h2>1. What HostelHub is</h2>
        <p>
          HostelHub is software. It lets hostels list their rooms, take bookings and rent online, and keep tenant records, and lets tenants book, pay and manage their stay. HostelHub is
          not a landlord, agent or party to any tenancy. Your tenancy is between you and your hostel.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>Give accurate information, and keep it up to date.</li>
          <li>Keep your login to yourself. You&apos;re responsible for what happens under your account; tell us straight away if you think someone else has used it.</li>
          <li>If you&apos;re under 18, use HostelHub with the consent of a parent or guardian.</li>
        </ul>
      </section>

      <section>
        <h2>3. For tenants</h2>
        <ul>
          <li>Rooms, prices, charges, rent periods and house rules are set by the hostel. Check them before you pay.</li>
          <li>When you start paying, your room or bed is held for a short time. It becomes yours once the payment is confirmed.</li>
          <li>
            The hostel is responsible for the room, its condition, repairs, the house rules and your tenancy agreement, including whether rent or deposits are refunded and how. Refundable
            deposits are paid to the hostel and returned by the hostel.
          </li>
          <li>If you join a hostel you already live in, the details you give must be true. The hostel confirms them before you&apos;re added.</li>
        </ul>
      </section>

      <section>
        <h2>4. Payments and the booking fee</h2>
        <ul>
          <li>Payments are processed by Paystack, a licensed payment company. Your rent and the hostel&apos;s charges are paid to the hostel&apos;s own bank account.</li>
          <li>When you pay online, a booking fee is added to the total. You&apos;ll see the amount before you pay.</li>
          <li>
            The booking fee pays for the booking and payment service and isn&apos;t refunded once your booking is confirmed, even if the hostel later refunds your rent. If you were charged
            in error, such as twice for the same booking, or for a booking that couldn&apos;t be completed, contact us and we&apos;ll put it right.
          </li>
          <li>Questions about rent, deposits or refunds of rent should go to your hostel first.</li>
        </ul>
      </section>

      <section>
        <h2>5. For hostels</h2>
        <h3>Your listing and your tenants</h3>
        <ul>
          <li>You must have the right to let the property, and your rooms, prices, charges and rules must be accurate.</li>
          <li>You are responsible for your tenancies, for following the laws that apply to your property and tenants, and for how you treat your tenants.</li>
          <li>
            You control your tenants&apos; personal data. Use it only to manage their tenancy, keep it accurate, and respect their rights under the Nigeria Data Protection Act. We process
            it on your behalf, as described in our <Link href="/privacy">Privacy Policy</Link>.
          </li>
        </ul>
        <h3>Payouts</h3>
        <ul>
          <li>Rent paid online settles to the bank account you set up, through Paystack. Payout times follow Paystack&apos;s schedule.</li>
          <li>A new payout account is verified before its first payout, which can delay that payout by up to a working day.</li>
          <li>You must give a bank account in your own or your business&apos;s name, and keep it up to date.</li>
        </ul>
        <h3>Fees</h3>
        <ul>
          <li>There are no setup or monthly fees. Rent your tenants pay online reaches you in full.</li>
          <li>
            Tenants who pay online pay HostelHub a booking fee on top: {feePercent}% of what they pay you (refundable deposits are left out), at least {naira(SERVICE_FEE.minimum)} and at
            most {naira(SERVICE_FEE.maximum)}.
          </li>
          <li>
            When you collect rent outside HostelHub, by adding a tenant by hand or recording a payment by hand on your dashboard, you pay HostelHub the same fee on that rent before it&apos;s
            saved. Payments made online never cost you anything.
          </li>
          <li>
            Tenants living with you before you go live can be added free during sign-up, and through your join link or a spreadsheet import for {JOIN_DAYS_AFTER_LIVE} days after you go live.
          </li>
          <li>We may change our fees. We&apos;ll tell you at least 30 days before a change affects you.</li>
        </ul>
      </section>

      <section>
        <h2>6. What you may not do</h2>
        <ul>
          <li>List a property you don&apos;t have the right to let, or post false prices, rooms or details.</li>
          <li>Use HostelHub for fraud, or to take payments outside it while presenting them as HostelHub payments.</li>
          <li>Upload someone else&apos;s photo or details without their permission.</li>
          <li>Try to access accounts or data that aren&apos;t yours, copy the platform in bulk, or disrupt the service.</li>
          <li>Break any law that applies to you.</li>
        </ul>
      </section>

      <section>
        <h2>7. Our service</h2>
        <p>
          We work to keep HostelHub available and accurate, but we provide it &ldquo;as is&rdquo; and can&apos;t promise it will always be uninterrupted or error-free. We may change or
          improve features over time. Hostel listings, prices and rules are provided by hostels, not by us.
        </p>
      </section>

      <section>
        <h2>8. Liability</h2>
        <ul>
          <li>We aren&apos;t responsible for a hostel&apos;s property, conduct, rules or refunds, or for disputes between tenants and hostels, though we&apos;ll help where we can.</li>
          <li>We aren&apos;t liable for indirect or consequential losses, such as lost profits or lost opportunities.</li>
          <li>
            Our total liability to you for any claim is limited to the fees you paid to HostelHub in the 12 months before the claim, except where the law doesn&apos;t allow liability to be
            limited.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Suspending or closing accounts</h2>
        <p>
          You can stop using HostelHub at any time. We may suspend or close an account, or remove a listing, if it breaks these terms, is used for fraud, or puts other users at risk. Where
          we can, we&apos;ll tell you why first. Records we must keep by law are kept after an account closes.
        </p>
      </section>

      <section>
        <h2>10. Law and disputes</h2>
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria. If something goes wrong, contact us first at <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> and
          we&apos;ll try to resolve it. Disputes that can&apos;t be resolved that way go to the courts of Nigeria.
        </p>
      </section>

      <section>
        <h2>11. Changes to these terms</h2>
        <p>
          We&apos;ll update these terms when our service or the law changes, and change the date at the top. If a change is significant, we&apos;ll tell you in the app or by email before it
          takes effect. Using HostelHub after that means you accept the new terms.
        </p>
      </section>
    </LegalPage>
  );
}

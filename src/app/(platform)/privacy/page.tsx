import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, LegalPage } from "@/components/site/LegalPage";
import { CONTACT } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Privacy Policy · HostelHub",
  description: "How HostelHub collects, uses and protects personal data, under Nigeria's Data Protection Act 2023.",
};

/** HostelHub's privacy policy, written for the Nigeria Data Protection Act 2023 (NDPA). */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          HostelHub helps hostels, lodges and apartments take bookings, collect rent and keep their tenant records, and helps tenants book a room and keep track of their rent. This policy
          explains what personal data we collect, why, who we share it with and the rights you have under the Nigeria Data Protection Act 2023 (NDPA). HostelHub is operated by{" "}
          {LEGAL.operator} (RC {LEGAL.rc}), a company registered in Nigeria (&ldquo;HostelHub&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
      }
    >
      <section>
        <h2>1. Who is responsible for your data</h2>
        <p>
          <b>Your hostel</b> decides what tenant information it needs and how it uses it, so for your records as a tenant (your details, room, rent and payments), the hostel is the data
          controller and HostelHub processes that data on the hostel&apos;s behalf, under its instructions.
        </p>
        <p>
          <b>HostelHub</b> is the data controller for your HostelHub login, for hostel owners&apos; accounts, for the service fee we charge, and for running, securing and improving the
          platform.
        </p>
        <p>
          For anything about your tenancy, you can contact your hostel. For anything else, or if you can&apos;t reach your hostel, contact us at{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
        </p>
      </section>

      <section>
        <h2>2. What we collect</h2>
        <h3>When you book a room or join your hostel</h3>
        <ul>
          <li>Your name, sex, phone number and email address.</li>
          <li>Your passport photograph.</li>
          <li>If you&apos;re a student: your faculty, course, level and matric or registration number.</li>
          <li>Your state of origin and home address, if you give them.</li>
          <li>Your next of kin&apos;s name, phone number and relationship to you.</li>
          <li>The names of anyone sharing a room with you, where the hostel lets rooms whole.</li>
          <li>Your room or bed, the length of your stay, when you moved in and how long your rent is paid for.</li>
        </ul>
        <h3>When you pay</h3>
        <ul>
          <li>
            What you paid, when, what it covered and the payment reference. Card, bank and wallet details are entered on and handled by our payment processor, Paystack. HostelHub never
            sees or stores your card number.
          </li>
        </ul>
        <h3>When you set up a hostel</h3>
        <ul>
          <li>The hostel&apos;s name, address, rooms, prices and charges.</li>
          <li>The manager&apos;s name and phone number.</li>
          <li>The bank account rent is paid into, and the account name your bank holds (we check it through Paystack).</li>
        </ul>
        <h3>When you use HostelHub</h3>
        <ul>
          <li>Your login details. If you sign in with Google, we receive your name and email address from Google.</li>
          <li>Repair requests, complaints, room-change requests and messages between you and your hostel.</li>
          <li>Basic technical information, such as your browser and IP address in our servers&apos; logs, used to keep the service secure and working.</li>
        </ul>
      </section>

      <section>
        <h2>3. Why we use it, and on what basis</h2>
        <ul>
          <li>
            <b>To provide the service you asked for</b> (performance of a contract): booking and reserving rooms, taking payments, issuing receipts, keeping tenancy records, running your
            tenant portal and ID card, and sending you messages from your hostel.
          </li>
          <li>
            <b>To meet legal obligations</b>: keeping financial and tax records, and responding to lawful requests from authorities.
          </li>
          <li>
            <b>For legitimate interests</b>: preventing fraud and abuse, securing accounts, fixing problems and improving HostelHub. We balance these against your rights and don&apos;t use
            your data in ways you wouldn&apos;t reasonably expect.
          </li>
          <li>
            <b>With your consent</b>, where we ask for it, such as push notifications on your phone. You can withdraw consent at any time in your browser or phone settings.
          </li>
        </ul>
        <p>We do not sell your personal data, and we do not use it for advertising.</p>
      </section>

      <section>
        <h2>4. Who we share it with</h2>
        <ul>
          <li>
            <b>Your hostel</b>: the hostel you book with or live in sees your tenant details, payments and requests. Each hostel only sees its own tenants.
          </li>
          <li>
            <b>Paystack</b>, our payment processor, to take payments, pay hostels and check bank account names.
          </li>
          <li>
            <b>Google</b> (Firebase and Google Cloud), which hosts HostelHub, stores our data and photos, and provides sign-in, including &ldquo;Continue with Google&rdquo;.
          </li>
          <li>
            <b>Zoho</b>, which runs our email, when you write to us.
          </li>
          <li>
            <b>Authorities</b>, where Nigerian law requires us to, or to protect people&apos;s safety or our legal rights.
          </li>
        </ul>
        <p>These providers process data only to provide their services to us, under agreements that require them to protect it.</p>
      </section>

      <section>
        <h2>5. Where your data is stored</h2>
        <p>
          HostelHub runs on Google Cloud, and your data may be stored and processed on servers outside Nigeria, including in the European Union and the United States. Where data leaves
          Nigeria, we rely on the safeguards the NDPA allows, such as the providers&apos; contractual commitments and their security and privacy certifications.
        </p>
      </section>

      <section>
        <h2>6. How long we keep it</h2>
        <ul>
          <li>Tenant records are kept while you live at the hostel and for as long afterwards as the hostel needs them for its records, or until the hostel deletes them.</li>
          <li>Payment and receipt records are kept for as long as Nigerian tax and accounting law requires.</li>
          <li>A request to join a hostel that the manager turns down is kept only as long as needed to deal with it.</li>
          <li>Your login is kept until you ask us to delete it, unless we need to keep some records for the reasons above.</li>
        </ul>
        <p>When we no longer need data, we delete it or make it anonymous.</p>
      </section>

      <section>
        <h2>7. How we protect it</h2>
        <p>
          Data travels over encrypted connections. Access is limited by role: a hostel can only see its own records, a tenant only their own, and our team only what&apos;s needed to run and
          support the service. Tenant ID cards carry a signed code so they can&apos;t be forged. No system is perfectly secure, but if a breach puts your rights at risk, we will tell you and
          the Nigeria Data Protection Commission as the law requires.
        </p>
      </section>

      <section>
        <h2>8. Your rights</h2>
        <p>Under the NDPA you can:</p>
        <ul>
          <li>ask for a copy of the personal data we hold about you;</li>
          <li>have inaccurate or incomplete data corrected;</li>
          <li>ask us to delete your data, where we don&apos;t need to keep it for a legal reason;</li>
          <li>object to, or ask us to restrict, how we use it;</li>
          <li>receive your data in a common, machine-readable format, or have it sent to another provider;</li>
          <li>withdraw consent you gave, without affecting what was done before;</li>
          <li>not be subject to decisions made solely by automated means that significantly affect you.</li>
        </ul>
        <p>
          To use any of these rights, email <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> from the address on your account. For tenancy records we&apos;ll work with your hostel,
          which controls them. We aim to respond within 30 days. If you&apos;re not satisfied, you can complain to the Nigeria Data Protection Commission (
          <a href="https://ndpc.gov.ng" target="_blank" rel="noreferrer">
            ndpc.gov.ng
          </a>
          ).
        </p>
      </section>

      <section>
        <h2>9. Young people</h2>
        <p>
          HostelHub is meant for adults. If you are under 18, please book or join your hostel with the knowledge and consent of a parent or guardian. If you are a parent or guardian and
          believe we hold data about your child without consent, contact us and we&apos;ll help.
        </p>
      </section>

      <section>
        <h2>10. Cookies and similar storage</h2>
        <p>
          We don&apos;t use advertising or tracking cookies. Your browser stores only what HostelHub needs to work: keeping you signed in, remembering a form you&apos;re filling in, and
          keeping a copy of your hostel&apos;s data so pages load quickly. Clearing your browser&apos;s site data removes it.
        </p>
      </section>

      <section>
        <h2>11. Changes to this policy</h2>
        <p>
          We&apos;ll update this policy when our service or the law changes, and change the date at the top. If a change materially affects how we use your data, we&apos;ll let you know in
          the app or by email before it takes effect. See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalPage>
  );
}

import { ArrowUpRight, Banknote, BedDouble, Bell, ClipboardList, IdCard, Mail, MessageCircle, NotebookPen, Plus, ReceiptText, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HowItWorks } from "@/components/site/HowItWorks";
import { BookingScreen, DashboardMock, IdCardMock, Phone, PortalScreen } from "@/components/site/Mockups";
import { RoomMapDemo } from "@/components/site/RoomMapDemo";
import { SECTIONS, Wordmark } from "@/components/site/brand";
import { SiteNav } from "@/components/site/SiteNav";
import { CONTACT, PLATFORM_HOST, whatsappHref } from "@/lib/platform";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "HostelHub: run your hostel from your phone",
  description: "Students book a room and pay online. You see every room, tenant and payment in one place. Free for hostels in Nigeria.",
};

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

/** Small numbered label above a section heading, e.g. [01] HOW IT WORKS */
function Eyebrow({ n, children, dark = false }: { n: string; children: ReactNode; dark?: boolean }) {
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs tracking-[0.14em] uppercase ring-1", dark ? "text-brand-200 ring-white/15" : "text-brand-800 ring-brand-200 bg-white")}>
      <span className={dark ? "text-brand-400" : "text-brand-500"}>[{n}]</span> {children}
    </p>
  );
}

function PrimaryCta({ children = "Get started free", className }: { children?: ReactNode; className?: string }) {
  return (
    <Link
      href="/start"
      className={cn(
        "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand-950 px-7 text-base font-semibold text-white shadow-[0_12px_30px_-12px_rgba(11,35,34,0.6)] transition-colors hover:bg-brand-800",
        className,
      )}
    >
      {children} <ArrowUpRight className="size-5 text-brand-300" />
    </Link>
  );
}

// --------------------------------------------------------------------------- the problem

const PAINS = [
  ["Paper registration forms", "Who is in room B7?", "Rent expired last month", "Receipts in a notebook", "Repairs lost in WhatsApp", "Students who \"already paid\""],
  ["Chasing rent one by one", "Agents adding their own charge", "Two students, one room", "Counting cash at the gate", "Next of kin? No idea", "Which rooms are free?"],
];

function PainRow({ items, reverse }: { items: string[]; reverse?: boolean }) {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
      <div className={cn("flex shrink-0 gap-3 pr-3 motion-safe:animate-[marquee_38s_linear_infinite]", reverse && "[animation-direction:reverse]")}>
        {[...items, ...items].map((p, i) => (
          <span key={i} className="flex items-center gap-2.5 rounded-full px-5 py-3 text-base whitespace-nowrap text-brand-50 ring-1 ring-white/12">
            <span className="size-1.5 rounded-full bg-rose-300" /> {p}
          </span>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- features

const FEATURES = [
  { icon: BedDouble, title: "A live map of every room", body: "Free, taken, rent due or under repair, block by block. Per room or per bed, 2 to 4 people." },
  { icon: Banknote, title: "Rent straight to your bank", body: "Students pay online by card, transfer or USSD through Paystack. HostelHub never holds your money." },
  { icon: ReceiptText, title: "Receipts that write themselves", body: "Every payment gets a numbered receipt, for you and for the student. No more receipt booklets." },
  { icon: Bell, title: "Know who owes, before they forget", body: "Rent running out this month, next month or already late, each in its own list. Remind them in one tap." },
  { icon: NotebookPen, title: "A register you can trust", body: "Name, course, level, phone, next of kin and photo for every tenant. Search it, export it, print it." },
  { icon: Wrench, title: "Repairs and complaints, tracked", body: "Tenants report from their phone, with a photo. You reply, and they see the progress." },
  { icon: IdCard, title: "Tenant ID at the gate", body: "Each tenant gets an ID with a QR code. Security scans it to see that the student really lives there." },
  { icon: ClipboardList, title: "Room changes, approved", body: "A tenant asks to move, you approve, and the room map and records update on their own." },
];

// --------------------------------------------------------------------------- questions

const FAQS = [
  ["How long does it take to set up?", "Most hostels are ready in an afternoon. You answer simple questions about your hostel, rooms and prices, one screen at a time. You can stop and pick up later, and nothing goes live until you say so."],
  ["I already have tenants. Do I start again?", "No. While you set up, you add the tenants you already have, with the room they're in and when their rent runs out. They're on your dashboard from day one."],
  ["Where does the rent money go?", "Straight to your hostel's bank account, through Paystack, a licensed payment company used by thousands of Nigerian businesses. HostelHub never holds your rent."],
  ["Can students still pay by cash or bank transfer?", "Yes. You record it on the dashboard and HostelHub gives them a receipt like any other. Online payment is just faster, because the room and the receipt happen on their own."],
  ["Do my students need to download an app?", "No. It works in the browser on any smartphone. Students can add it to their home screen if they like, and it opens like an app."],
  ["What if two students want the same room?", "The room map is live. When a student starts paying, the room is held for them for 15 minutes, so two people can never pay for the same room."],
  ["Does it work for hostels that rent by the bed?", "Yes. You choose per room or per bed when you set up, with rooms for 2, 3 or 4 people, and you can mix room sizes in one hostel."],
  ["Do I need a website?", `No. Your hostel gets its own address, like yourhostel.${PLATFORM_HOST}, and a QR poster to print. That's your booking page.`],
  ["Is our data safe?", "It's stored on Google's cloud. Your staff only see your hostel, and each student only sees their own records and receipts."],
  ["What does it cost?", "Nothing for hostels. No setup fee and no monthly subscription."],
];

function Faq() {
  return (
    <div className="divide-y divide-brand-100 border-y border-brand-100">
      {FAQS.map(([q, a], i) => (
        <details key={q} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-4 py-5 sm:gap-6 sm:py-6 [&::-webkit-details-marker]:hidden">
            <span className="w-7 shrink-0 font-mono text-sm text-brand-400">{String(i + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-lg font-semibold tracking-tight text-grey-950 sm:text-xl">{q}</span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_-6px_rgba(11,35,34,0.25)] ring-1 ring-black/5 transition-transform group-open:rotate-45">
              <Plus className="size-5 text-brand-950" />
            </span>
          </summary>
          <p className="max-w-2xl pb-6 pl-11 text-base leading-relaxed text-heading-5 sm:pl-[52px]">{a}</p>
        </details>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- page

export default function SitePage() {
  return (
    <div id="top" className="bg-[#f6f8f7] text-grey-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden pt-28 sm:pt-36">
        <div className="pointer-events-none absolute -top-40 right-[-10%] size-[640px] rounded-full bg-brand-100/70 blur-3xl" />
        <div className="pointer-events-none absolute top-60 -left-40 size-[420px] rounded-full bg-brand-50 blur-3xl" />
        <div className={cn(container, "relative grid items-center gap-14 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-12")}>
          <div className="relative z-10 motion-safe:animate-[rise_0.7s_ease-out]">
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm text-heading-4 ring-1 ring-black/5">
              <span className="size-2 rounded-full bg-brand-500" /> Built for student hostels in Nigeria
            </p>
            <h1 className="mt-6 text-[clamp(2.75rem,5.6vw,4.6rem)] leading-[0.98] font-bold tracking-[-0.045em] text-balance text-brand-950">
              Run your hostel
              <br />
              <span className="text-brand-600">from your phone.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-heading-5 sm:text-xl">
              Students pick a room, fill their form and pay online. You see every room, every tenant and every naira, without paper forms or chasing rent.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <PrimaryCta />
              <a href="#how-it-works" className="inline-flex h-14 items-center rounded-full px-5 text-base font-semibold text-brand-900 ring-1 ring-brand-200 transition-colors hover:bg-white">
                See how it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-heading-5">
              {["Free for hostels", "Rent paid to your bank", "Works on any phone"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* The phone overlaps the dashboard's lower-left corner, never the text column */}
          <div className="relative mx-auto w-full max-w-xl pb-24 pl-10 motion-safe:animate-[rise_0.9s_ease-out] sm:pb-28 sm:pl-16">
            <DashboardMock className="w-full" />
            <Phone className="absolute bottom-0 left-0 w-36 sm:w-44">
              <BookingScreen />
            </Phone>
          </div>
        </div>

        {/* Facts strip (no made-up numbers: what's true for every hostel on day one) */}
        <div className={cn(container, "relative mt-20 sm:mt-28")}>
          <div className="grid gap-px overflow-hidden rounded-3xl bg-brand-100 ring-1 ring-brand-100 sm:grid-cols-3">
            {[
              ["₦0", "to set up, and no monthly fee"],
              ["15 min", "hold on a room while a student pays"],
              ["24/7", "students can book, even while you sleep"],
            ].map(([big, small]) => (
              <div key={big} className="bg-white px-7 py-7">
                <p className="text-4xl font-semibold tracking-tight text-brand-950">{big}</p>
                <p className="mt-2 text-[15px] text-heading-5">{small}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="mt-24 bg-brand-950 py-20 text-white sm:mt-32 sm:py-28">
        <div className={container}>
          <Eyebrow n="01" dark>
            Sound familiar?
          </Eyebrow>
          <h2 className="mt-6 max-w-4xl text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[1] font-bold tracking-[-0.04em]">
            Still running your hostel from a <span className="text-brand-300">notebook and WhatsApp?</span>
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-brand-100/75">
            Forms go missing, rent runs out without anyone noticing, and nobody is sure which rooms are free. HostelHub puts all of it in one place that updates itself.
          </p>
        </div>
        <div className="mt-14 space-y-3">
          <PainRow items={PAINS[0]} />
          <PainRow items={PAINS[1]} reverse />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 py-24 sm:py-32">
        <div className={container}>
          <Eyebrow n="02">How it works</Eyebrow>
          <h2 className="mt-6 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1] font-bold tracking-[-0.04em] text-brand-950">
            From sign-up to <span className="text-brand-600">full rooms</span> in four steps.
          </h2>
          <div className="mt-14">
            <HowItWorks />
          </div>
        </div>
      </section>

      {/* Try it */}
      <section className="pb-24 sm:pb-32">
        <div className={cn(container, "grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
          <div>
            <Eyebrow n="03">Try it here</Eyebrow>
            <h2 className="mt-6 text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.02] font-bold tracking-[-0.04em] text-brand-950">This is what your students see.</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-heading-5">
              A live floor plan of your hostel. Rooms turn taken the moment someone pays, so students never pick a room that&apos;s gone, and you never have to
              say sorry.
            </p>
          </div>
          <RoomMapDemo />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 bg-white py-24 sm:py-32">
        <div className={container}>
          <Eyebrow n="04">Everything in one place</Eyebrow>
          <h2 className="mt-6 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1] font-bold tracking-[-0.04em] text-brand-950">
            Less paperwork. <span className="text-brand-600">More full rooms.</span>
          </h2>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-3xl bg-[#f6f8f7] p-6 ring-1 ring-black/[0.04] transition-colors hover:bg-brand-50">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-brand-700 ring-1 ring-black/5">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg leading-snug font-semibold tracking-tight text-grey-950">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-heading-5">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For students */}
      <section className="overflow-hidden bg-brand-950 py-24 text-white sm:py-32">
        <div className={cn(container, "grid items-center gap-16 lg:grid-cols-2")}>
          <div>
            <Eyebrow n="05" dark>
              For your students
            </Eyebrow>
            <h2 className="mt-6 text-[clamp(2.25rem,5vw,4rem)] leading-[1] font-bold tracking-[-0.04em]">
              Their room, their receipts, <span className="text-brand-300">in their pocket.</span>
            </h2>
            <ul className="mt-8 space-y-4 text-lg text-brand-100/80">
              {[
                [Smartphone, "Book and pay in minutes, from any phone"],
                [ReceiptText, "Every receipt kept, never lost"],
                [Wrench, "Report a repair with a photo"],
                [IdCard, "A tenant ID that security can scan at the gate"],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Wrench;
                return (
                  <li key={text as string} className="flex items-center gap-3.5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/8 ring-1 ring-white/10">
                      <I className="size-5 text-brand-300" />
                    </span>
                    {text as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="relative mx-auto flex w-full max-w-md items-center justify-center py-6">
            <div className="pointer-events-none absolute size-96 rounded-full bg-brand-500/25 blur-3xl" />
            <Phone className="relative w-56 rotate-[-4deg] sm:w-60">
              <PortalScreen />
            </Phone>
            <IdCardMock className="absolute -right-2 -bottom-4 rotate-[6deg] sm:-right-8" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 py-24 sm:py-32">
        <div className={container}>
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow n="06">Pricing</Eyebrow>
            <h2 className="mt-6 text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.98] font-bold tracking-[-0.045em] text-brand-950">
              Free for hostels.
              <br />
              <span className="text-brand-600">Really.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-heading-5">No setup fee. No monthly subscription. No card needed to start.</p>
          </div>
          <div className="mx-auto mt-12 max-w-3xl rounded-[2rem] bg-white p-7 shadow-[0_30px_70px_-30px_rgba(11,35,34,0.3)] ring-1 ring-black/5 sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-grey-100 pb-7">
              <div>
                <p className="text-sm font-medium text-brand-700">Everything included</p>
                <p className="mt-1 text-5xl font-bold tracking-tight text-brand-950">₦0</p>
              </div>
              <PrimaryCta />
            </div>
            <ul className="mt-7 grid gap-x-8 gap-y-3.5 text-[15px] text-heading-4 sm:grid-cols-2">
              {[
                "Your own booking page and QR poster",
                "Online payments straight to your bank",
                "Live room map, per room or per bed",
                "Rent tracking and reminders",
                "Automatic receipts",
                "Tenant register with photos",
                "Repairs, complaints and room changes",
                "Tenant IDs for the gate",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800">
                    <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m2.5 6.2 2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Questions */}
      <section id="questions" className="scroll-mt-24 pb-24 sm:pb-32">
        <div className={cn(container, "grid gap-12 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16")}>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow n="07">Questions</Eyebrow>
            <h2 className="mt-6 text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] font-bold tracking-[-0.045em] text-brand-950">Questions.</h2>
            <p className="mt-5 text-lg text-heading-5">Something else on your mind? Talk to a person.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
              <a
                href={whatsappHref()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2.5 self-start rounded-full bg-[#1f7a4d] px-5 text-[15px] font-semibold text-white hover:bg-[#1a6942]"
              >
                <MessageCircle className="size-5" /> WhatsApp {CONTACT.whatsapp}
              </a>
              <a href={`mailto:${CONTACT.email}`} className="inline-flex h-12 items-center gap-2.5 self-start rounded-full px-5 text-[15px] font-semibold text-brand-900 ring-1 ring-brand-200 hover:bg-white">
                <Mail className="size-5" /> Email us
              </a>
            </div>
          </div>
          <Faq />
        </div>
      </section>

      {/* Closing */}
      <footer className="relative overflow-hidden bg-brand-950 text-white">
        <div className={cn(container, "relative pt-20 sm:pt-28")}>
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="max-w-3xl text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.98] font-bold tracking-[-0.045em]">
              Fill your rooms.
              <br />
              <span className="text-brand-300">Skip the paperwork.</span>
            </h2>
            <Link
              href="/start"
              className="inline-flex h-16 items-center gap-2 self-start rounded-full bg-brand-300 px-8 text-lg font-semibold text-brand-950 shadow-[0_0_50px_-5px_rgba(123,191,186,0.6)] transition-colors hover:bg-brand-200 lg:self-auto"
            >
              Get started free <ArrowUpRight className="size-5" />
            </Link>
          </div>

          <div className="mt-16 flex flex-col gap-8 border-t border-white/10 pt-10 sm:mt-20 md:flex-row md:items-start md:justify-between">
            <div>
              <Wordmark dark />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-brand-100/60">Hostel management for Nigerian student hostels: bookings, rent, receipts and tenants in one place.</p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-3 text-[15px] font-medium text-brand-50/85">
              {SECTIONS.map((s) => (
                <a key={s.href} href={s.href} className="hover:text-white">
                  {s.label}
                </a>
              ))}
              <Link href="/login" className="hover:text-white">
                Log in
              </Link>
            </nav>
            <div className="space-y-2 text-[15px] text-brand-50/85">
              <a href={whatsappHref()} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white">
                <MessageCircle className="size-4 text-brand-300" /> {CONTACT.whatsapp}
              </a>
              <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-2 hover:text-white">
                <Mail className="size-4 text-brand-300" /> {CONTACT.email}
              </a>
            </div>
          </div>
          <div className="flex items-center justify-between py-8 text-sm text-brand-100/45">
            <p>© HostelHub</p>
            <a href="#top" className="flex items-center gap-1.5 hover:text-white">
              Back to top <ArrowUpRight className="size-4" />
            </a>
          </div>
        </div>
        {/* The giant faded wordmark */}
        <p aria-hidden className="pointer-events-none -mb-[0.22em] text-center text-[clamp(5rem,22vw,20rem)] leading-none font-bold tracking-[-0.06em] text-white/[0.045] select-none">
          hostelhub
        </p>
      </footer>
    </div>
  );
}

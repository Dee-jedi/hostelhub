import Link from "next/link";

/** Slim top bar for pages outside the staff app (booking form, login, tenant portal). */
export function PublicHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-grey-100 bg-white px-4 sm:px-6">
      <Link href="/book" className="inline-flex items-start text-[17px] leading-none font-semibold tracking-tight text-grey-950">
        hostel<span className="text-brand-600">hub</span>
      </Link>
      {right}
    </header>
  );
}
